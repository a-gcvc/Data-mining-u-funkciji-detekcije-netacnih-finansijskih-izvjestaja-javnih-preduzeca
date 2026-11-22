"""Pomoćne funkcije za projekat 'Predviđanje revizorskog mišljenja' (javna preduzeća FBiH).

Isti modul koristi notebook `02_finalni_model.ipynb` i (kasnije) web aplikacija, tako da
priprema podataka i modeli budu identični u oba slučaja.
"""
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.neural_network import MLPClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

RS = 42

# 23 ulazne bilansne pozicije (t = tekuća godina, t1 = prethodna godina)
RAW_COLS = [
    'potrazivanja_kupci_t', 'prihod_prodaja_t', 'potrazivanja_kupci_t1', 'prihod_prodaja_t1',
    'poslovni_rashodi_t1', 'poslovni_rashodi_t', 'obrtna_imovina_t', 'nekretnine_oprema_t',
    'kratk_fin_plasmani_t', 'poslovna_imovina_t', 'obrtna_imovina_t1', 'nekretnine_oprema_t1',
    'kratk_fin_plasmani_t1', 'poslovna_imovina_t1', 'amortizacija_t1', 'amortizacija_t',
    'admin_rashodi_t', 'admin_rashodi_t1', 'kratk_obaveze_t', 'dugor_obaveze_t',
    'kratk_obaveze_t1', 'dugor_obaveze_t1', 'novcani_tok_poslovni_t',
]


def slog(x):
    """Signed log: log(1+|x|) uz očuvanje predznaka (pozicije su jako desno asimetrične)."""
    return np.sign(x) * np.log1p(np.abs(x))


class Winsorizer(BaseEstimator, TransformerMixin):
    """Ograničava ekstremne vrijednosti na 1. i 99. percentil (učeno samo na treningu)."""
    def __init__(self, lo=0.01, hi=0.99):
        self.lo = lo
        self.hi = hi

    def fit(self, X, y=None):
        X = np.asarray(X, float)
        self.lo_ = np.nanquantile(X, self.lo, axis=0)
        self.hi_ = np.nanquantile(X, self.hi, axis=0)
        return self

    def transform(self, X):
        return np.clip(np.asarray(X, float), self.lo_, self.hi_)


def ocisti(df):
    """Nemoguće nule (nekretnine/amortizacija = 0 u obje godine) -> NaN. Vraća kopiju."""
    d = df.copy()
    for a, b in [('nekretnine_oprema_t', 'nekretnine_oprema_t1'), ('amortizacija_t', 'amortizacija_t1')]:
        m = (d[a] == 0) & (d[b] == 0)
        d.loc[m, [a, b]] = np.nan
    return d


def izracunaj_omjere(d):
    """19 finansijskih omjera izvedenih isključivo iz 23 sirove pozicije."""
    def dj(a, b):
        return a / b.replace(0, np.nan)
    r = pd.DataFrame(index=d.index)
    r['marza_t'] = dj(d.prihod_prodaja_t - d.poslovni_rashodi_t, d.prihod_prodaja_t)
    r['marza_t1'] = dj(d.prihod_prodaja_t1 - d.poslovni_rashodi_t1, d.prihod_prodaja_t1)
    r['zaduzenost_t'] = dj(d.kratk_obaveze_t + d.dugor_obaveze_t, d.poslovna_imovina_t)
    r['zaduzenost_t1'] = dj(d.kratk_obaveze_t1 + d.dugor_obaveze_t1, d.poslovna_imovina_t1)
    r['kratk_obaveze_udio_t'] = dj(d.kratk_obaveze_t, d.poslovna_imovina_t)
    r['likvidnost_t'] = dj(d.obrtna_imovina_t, d.kratk_obaveze_t)
    r['likvidnost_t1'] = dj(d.obrtna_imovina_t1, d.kratk_obaveze_t1)
    r['potraz_prihod_t'] = dj(d.potrazivanja_kupci_t, d.prihod_prodaja_t)
    r['potraz_prihod_t1'] = dj(d.potrazivanja_kupci_t1, d.prihod_prodaja_t1)
    r['potraz_prihod_promjena'] = dj(r['potraz_prihod_t'], r['potraz_prihod_t1'])
    r['rast_prihoda'] = dj(d.prihod_prodaja_t, d.prihod_prodaja_t1) - 1
    r['rast_rashoda'] = dj(d.poslovni_rashodi_t, d.poslovni_rashodi_t1) - 1
    r['rast_imovine'] = dj(d.poslovna_imovina_t, d.poslovna_imovina_t1) - 1
    r['novcani_tok_imovina'] = dj(d.novcani_tok_poslovni_t, d.poslovna_imovina_t)
    r['op_rezultat_imovina'] = dj(d.prihod_prodaja_t - d.poslovni_rashodi_t, d.poslovna_imovina_t)
    r['kfp_udio'] = dj(d.kratk_fin_plasmani_t, d.poslovna_imovina_t)
    r['obrtna_udio'] = dj(d.obrtna_imovina_t, d.poslovna_imovina_t)
    r['nekretnine_udio'] = dj(d.nekretnine_oprema_t, d.poslovna_imovina_t)
    r['log_imovina'] = np.log1p(d.poslovna_imovina_t.clip(lower=0))
    return r.replace([np.inf, -np.inf], np.nan)


def napravi_X(df, skup):
    """Matrica atributa za zadati skup: 'S1' (23 sirove), 'S6' (19 omjera), 'S7' (sirove + omjeri)."""
    d = ocisti(df)
    sirove = d[RAW_COLS]
    if skup == 'S1':
        return sirove
    if skup == 'S6':
        return izracunaj_omjere(d)
    if skup == 'S7':
        return pd.concat([sirove, izracunaj_omjere(d)], axis=1)
    raise ValueError(f"Nepoznat skup atributa: {skup}")


def _pipe(model, scale, winsor):
    koraci = [('imp', SimpleImputer(strategy='median'))]
    if winsor:
        koraci.append(('win', Winsorizer()))
    if scale:
        koraci += [('log', FunctionTransformer(slog, feature_names_out='one-to-one')), ('sc', StandardScaler())]
    koraci.append(('m', model))
    return Pipeline(koraci)


# Kandidati: naziv -> (skup atributa, funkcija koja pravi novi pipeline). Postavke su iste kao u glavnom notebooku.
KANDIDATI = {
    'LR | S6 omjeri': ('S6', lambda: _pipe(LogisticRegression(max_iter=2000, class_weight='balanced', C=0.5, random_state=RS), True, True)),
    'LR | S1 sirove': ('S1', lambda: _pipe(LogisticRegression(max_iter=2000, class_weight='balanced', C=0.5, random_state=RS), True, False)),
    'SVM | S7 sirove+omjeri': ('S7', lambda: _pipe(SVC(probability=True, class_weight='balanced', random_state=RS), True, True)),
    'MLP | S1 sirove': ('S1', lambda: _pipe(MLPClassifier(hidden_layer_sizes=(16,), alpha=0.01, max_iter=2000, random_state=RS), True, False)),
    'RF | S6 omjeri': ('S6', lambda: _pipe(RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight='balanced', random_state=RS), False, True)),
}


def skoruj(df_raw, paket):
    """Vjerovatnoća nepovoljnog mišljenja i kategorija rizika za nove izvještaje.

    df_raw: DataFrame s 23 kolone iz RAW_COLS (može imati i dodatne kolone, npr. ID).
    paket: rječnik koji je sačuvao notebook (model, skup, pragovi...).
    """
    X = napravi_X(df_raw, paket['skup'])
    p_povoljno = paket['model'].predict_proba(X)[:, 1]
    rizik = 1 - p_povoljno
    kat = np.where(rizik >= paket['prag_visok'], 'visok',
                   np.where(rizik >= paket['prag_srednji'], 'srednji', 'nizak'))
    out = pd.DataFrame({'rizik_negativno_misljenje': rizik, 'kategorija_rizika': kat}, index=df_raw.index)
    return out
