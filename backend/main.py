"""Backend aplikacije: procjena pozitivnog / negativnog revizorskog mišljenja.

Pokretanje (iz foldera backend):  uvicorn main:app --reload
Zatim otvoriti http://127.0.0.1:8000
"""
import io
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).parent
sys.path.append(str(BASE))
import revizija_utils as U  # noqa: E402

# Ključevi koje MORA imati model-bundle da bi backend mogao sigurno startati. Ako notebook
# 02_finalni_model.ipynb nije ponovo pokrenut nakon izmjene sheme (npr. dodavanja 'pouzdanost'),
# bundle je zastario i aplikacija bi tiho vraćala pogrešne/nepotpune rezultate (npr. pouzdanost=None).
# Zato radije odbijamo pokretanje s jasnom porukom nego da puštamo takav bundle u produkciju.
OBAVEZNI_KLJUCEVI_BUNDLA = {
    'model', 'skup', 'naziv', 'prag_povisen', 'oof_rizik_sortirano', 'referentne',
    'pouzdanost', 'n_izvjestaja', 'n_preduzeca', 'godine', 'cv_auc', 'sklearn_version',
}


def _ucitaj_i_provjeri_bundle(putanja):
    paket = joblib.load(putanja)
    nedostaju = OBAVEZNI_KLJUCEVI_BUNDLA - set(paket.keys())
    if nedostaju:
        raise RuntimeError(
            'Model-bundle je zastario (nedostaju podaci: ' + ', '.join(sorted(nedostaju)) + '). '
            'Ponovo pokrenite notebooks/02_finalni_model.ipynb (Restart kernel -> Run All) da se '
            'model-bundle snimi u aktuelnom formatu, pa restartujte backend.'
        )
    if paket['sklearn_version'] != sklearn.__version__:
        raise RuntimeError(
            f"Model je treniran sa scikit-learn {paket['sklearn_version']}, a instalirana je verzija "
            f"{sklearn.__version__}. Instalirajte odgovarajuću verziju (pip install "
            f"scikit-learn=={paket['sklearn_version']}) ili ponovo pokrenite "
            'notebooks/02_finalni_model.ipynb u ovom okruženju da se model ponovo istrenira.'
        )
    return paket


PAKET = _ucitaj_i_provjeri_bundle(BASE / 'models' / 'revizija_model.joblib')
FRONT = BASE.parent / 'frontend'

# (grupa, naziv, kolona za tekuću godinu, kolona za prethodnu godinu ili None)
POZICIJE = [
    ('Bilans uspjeha', 'Prihod od prodaje', 'prihod_prodaja_t', 'prihod_prodaja_t1'),
    ('Bilans uspjeha', 'Poslovni rashodi', 'poslovni_rashodi_t', 'poslovni_rashodi_t1'),
    ('Bilans stanja: imovina', 'Poslovna imovina (ukupno)', 'poslovna_imovina_t', 'poslovna_imovina_t1'),
    ('Bilans stanja: imovina', 'Obrtna imovina', 'obrtna_imovina_t', 'obrtna_imovina_t1'),
    ('Bilans stanja: imovina', 'Nekretnine, postrojenja i oprema', 'nekretnine_oprema_t', 'nekretnine_oprema_t1'),
    ('Bilans stanja: imovina', 'Potraživanja od kupaca', 'potrazivanja_kupci_t', 'potrazivanja_kupci_t1'),
    ('Bilans stanja: imovina', 'Kratkoročni finansijski plasmani', 'kratk_fin_plasmani_t', None),
    ('Bilans stanja: obaveze', 'Kratkoročne obaveze', 'kratk_obaveze_t', 'kratk_obaveze_t1'),
    ('Bilans stanja: obaveze', 'Dugoročne obaveze', 'dugor_obaveze_t', 'dugor_obaveze_t1'),
    ('Tok gotovine', 'Neto novčani tok iz poslovnih aktivnosti', 'novcani_tok_poslovni_t', None),
]
POTREBNE = [c for _, _, t, t1 in POZICIJE for c in (t, t1) if c]
# pozicije koje finalni model (omjeri) ne koristi; ne traže se od korisnika
NEPOTREBNE = [c for c in U.RAW_COLS if c not in POTREBNE]
MAX_PRAZNIH = 6

app = FastAPI(title='Procjena revizorskog mišljenja')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])


class Unos(BaseModel):
    vrijednosti: dict[str, float | None]


def _skoruj(df):
    d = df.copy()
    for c in U.RAW_COLS:
        if c not in d.columns:
            d[c] = np.nan
    return U.skoruj(d, PAKET, ignoriraj=NEPOTREBNE)


def _procjena(kategorija):
    neg = kategorija == 'povišen'
    pouzd = PAKET.get('pouzdanost', {})
    return {'procjena': 'negativno' if neg else 'pozitivno',
            'pouzdanost': pouzd.get('negativno' if neg else 'pozitivno')}


@app.get('/api/info')
def info():
    return {'pozicije': [{'grupa': g, 'naziv': n, 't': t, 't1': t1} for g, n, t, t1 in POZICIJE],
            'model': {'naziv': PAKET['naziv'], 'n_izvjestaja': PAKET['n_izvjestaja'],
                      'n_preduzeca': PAKET['n_preduzeca'], 'godine': PAKET['godine'],
                      'cv_auc': PAKET['cv_auc']}}


@app.post('/api/predict')
def predict(unos: Unos):
    nepoznate = [k for k in unos.vrijednosti if k not in POTREBNE]
    if nepoznate:
        raise HTTPException(400, 'Nepoznata polja: ' + ', '.join(nepoznate))
    red = {c: unos.vrijednosti.get(c) for c in POTREBNE}
    prazno = sum(v is None for v in red.values())
    if prazno > MAX_PRAZNIH:
        raise HTTPException(400, f'Premalo podataka: popunjeno je {len(red) - prazno} od {len(red)} polja '
                                 f'(najviše {MAX_PRAZNIH} smije ostati prazno).')
    df = pd.DataFrame([red], dtype=float)
    rez = _skoruj(df).iloc[0]
    return {**_procjena(rez.kategorija_rizika), 'kategorija_rizika': rez.kategorija_rizika,
            'percentil': int(rez.percentil), 'upozorenja': list(rez.upozorenja),
            'usporedba_omjera': U.usporedba_omjera(df.reindex(columns=U.RAW_COLS), PAKET)[0]}


@app.post('/api/predict-csv')
async def predict_csv(datoteka: UploadFile = File(...)):
    try:
        df = pd.read_csv(io.BytesIO(await datoteka.read()), sep=None, engine='python', encoding='utf-8-sig')
    except Exception:
        raise HTTPException(400, 'CSV se ne može pročitati.')
    nedostaju = [c for c in POTREBNE if c not in df.columns]
    if nedostaju:
        raise HTTPException(400, 'Nedostaju kolone: ' + ', '.join(nedostaju))
    if len(df) == 0 or len(df) > 5000:
        raise HTTPException(400, 'CSV mora imati između 1 i 5000 redova.')
    df = df.reset_index(drop=True)
    ids = df['ID_preduzeca'].astype(str) if 'ID_preduzeca' in df.columns else pd.Series(range(1, len(df) + 1)).astype(str)
    rez = _skoruj(df)
    rez['id'] = ids.values
    rez = rez.sort_values('rizik_skor', ascending=False).reset_index(drop=True)
    return {'redovi': [{'rang': i + 1, 'id': r.id, **_procjena(r.kategorija_rizika),
                        'kategorija_rizika': r.kategorija_rizika, 'percentil': int(r.percentil),
                        'upozorenja': list(r.upozorenja)} for i, r in rez.iterrows()]}


@app.get('/api/predlozak')
def predlozak():
    return PlainTextResponse(','.join(['ID_preduzeca'] + POTREBNE) + '\n', media_type='text/csv',
                             headers={'Content-Disposition': 'attachment; filename=predlozak_unos.csv'})


if FRONT.exists():
    app.mount('/', StaticFiles(directory=FRONT, html=True), name='frontend')
