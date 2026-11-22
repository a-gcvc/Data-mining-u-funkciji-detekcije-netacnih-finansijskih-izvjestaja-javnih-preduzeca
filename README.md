# Predviđanje revizorskog mišljenja na osnovu bilansnih pozicija

Istraživački projekat u okviru **Asocijacije za napredak nauke i tehnologije**, pod mentorstvom **prof. dr. Amre Gadžo**.
2026.godina

## Poenta projekta

Revizori ne mogu detaljno pregledati svako preduzeće svake godine. Projekat provjerava da li se iz osnovnih bilansnih pozicija javnih preduzeća u FBiH može procijeniti **vjerovatnoća nepovoljnog revizorskog mišljenja**, kako bi se ograničeni revizorski kapaciteti usmjerili na preduzeća s višim rizikom.

Model **ne dokazuje prevaru** i ne zamjenjuje reviziju. Revizorsko mišljenje je zamjenska mjera (proxy) za kvalitet finansijskog izvještaja, a rezultat je pomoć pri planiranju revizije.

## Istraživačka pitanja

- **H1:** Da li se vrsta revizorskog mišljenja može klasifikovati sa zadovoljavajućom tačnošću?
- **H2:** Zavisi li tačnost od izbora algoritma i skupa atributa?

## Podaci

- 312 izvještaja, 170 preduzeća, period 2004–2025
- 23 bilansne pozicije (tekuća i prethodna godina) i 19 izvedenih finansijskih omjera
- Ciljna varijabla: 1 = pozitivno mišljenje ili s rezervom, 0 = negativno mišljenje ili suzdržavanje

## Metodologija

- Selekcija atributa: InfoGain, CFS
- Algoritmi: logistička regresija, SVM, Random Forest, MLP, Decision Tree, k-NN, Naive Bayes
- Validacija: 10-fold CV, grupna CV (sve godine jednog preduzeća zajedno) i vremenski test (do 2021 / od 2022)
- Statistika: Friedmanov test, korigovani t-test, Holmova korekcija, intervali povjerenja (bootstrap)

## Glavni rezultati

- AUC oko 0,73 (interval [donja–gornja]), dakle umjeren, ali stvaran signal
- Razlike među algoritmima nisu statistički značajne, pa je izabrana **logistička regresija na omjerima** zbog objašnjivosti
- Najkorisniji nalaz je **rangiranje rizika**: gornjih 30% izvještaja obuhvata oko 50% negativnih mišljenja
- Model je koristan za prioritizaciju, a ne za automatsku odluku (recall za negativna mišljenja je umjeren)

## Struktura projekta

```
backend/     revizija_utils.py (priprema podataka i modeli), models/ (sačuvani model)
data/        raw/ (dataset), outputs/ (rang-lista, predložak za unos)
notebooks/   analiza_revizorsko_misljenje.ipynb (cjelokupna analiza)
             02_finalni_model.ipynb (finalni model i rangiranje rizika)
frontend/    web aplikacija (u izradi)
```

## Kako pokrenuti

```bash
pip install -r backend/requirements.txt
cd notebooks
jupyter notebook          # pokrenuti 02_finalni_model.ipynb (Restart kernel → Run All)
```

Notebook snima model u `backend/models/revizija_model.joblib` i rezultate u `data/outputs/`.

## Ograničenja

Mali uzorak i široki intervali povjerenja, automatski dodijeljeni ID-ovi i sektori, retrospektivna validacija i slab pojedinačni informacijski dobitak atributa.
Rezultate treba tumačiti oprezno i ne primjenjivati ih kao jedini kriterij odluke.

## Napomena o ponovljivosti

Rezultati zavise od verzije biblioteke scikit-learn ([verzija]) i broja ponavljanja validacije (`N_REPEATS`). Navedeno je u notebooku.
