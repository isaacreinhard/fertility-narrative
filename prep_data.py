import io, zipfile, urllib.request, datetime
import pandas as pd

URL = "https://api.worldbank.org/v2/en/indicator/SP.DYN.TFRT.IN?downloadformat=csv"
KEEP_AGGS = {"WLD", "SSF"}   # two special rows we plot by name: World, Sub-Saharan Africa

raw = urllib.request.urlopen(URL).read()          # ← if offline, replace these two lines with:
zf  = zipfile.ZipFile(io.BytesIO(raw))            # ← zf = zipfile.ZipFile("name-of-downloaded.zip")
data_name = next(n for n in zf.namelist() if n.startswith("API_"))
meta_name = next(n for n in zf.namelist() if n.startswith("Metadata_Country"))

wide = pd.read_csv(zf.open(data_name), skiprows=4)      # first 4 lines are junk headers
meta = pd.read_csv(zf.open(meta_name))[["Country Code", "Region"]]

years = [c for c in wide.columns if c.isdigit()]
tidy = (wide.melt(id_vars=["Country Name", "Country Code"], value_vars=years,
                  var_name="year", value_name="tfr")
             .dropna(subset=["tfr"])
             .merge(meta, on="Country Code", how="left"))

# Real countries have a Region; groupings like "World" or "Euro area" don't.
countries = tidy[tidy["Region"].notna() & (tidy["Region"] != "")]
aggs      = tidy[tidy["Country Code"].isin(KEEP_AGGS)].assign(Region="Aggregate")

out = (pd.concat([countries, aggs])
         .rename(columns={"Country Name": "name", "Country Code": "code",
                          "Region": "region"}))
out["year"] = out["year"].astype(int)
out["tfr"]  = out["tfr"].round(3)
out = out[["code", "name", "region", "year", "tfr"]].sort_values(["code", "year"])
out.to_csv("data/fertility.csv", index=False)

# ---- Numbers the story quotes. PRINT AND READ THESE. ----
v = out.set_index(["code", "year"])["tfr"]
for probe in [("WLD",1960), ("WLD",2024), ("CHN",1963), ("CHN",1979), ("IRN",1985),
              ("BGD",1971), ("BGD",2024), ("KOR",1983), ("KOR",2018), ("KOR",2023),
              ("KOR",2024), ("JPN",2024), ("ITA",2024), ("NER",2024), ("SSF",2024)]:
    print(probe, v.get(probe, "—"))
print("countries:", out[out.region != "Aggregate"].code.nunique(),
      "| max year:", out.year.max(),
      "| extracted:", datetime.date.today())
