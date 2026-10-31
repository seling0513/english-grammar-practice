import os, zipfile, sys
SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = r"D:/Documents/body-agent/grammar-practice-offline.zip"
ROOT = "grammar-practice"
INCLUDE = ["index.html", "css", "js", "audio"]
if os.path.exists(OUT): os.remove(OUT)
n = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for item in INCLUDE:
        p = os.path.join(SRC, item)
        if os.path.isfile(p):
            z.write(p, f"{ROOT}/{item}"); n += 1
        elif os.path.isdir(p):
            for dp, dn, fn in os.walk(p):
                dn.sort(); fn.sort()
                for f in fn:
                    fp = os.path.join(dp, f)
                    rel = os.path.relpath(fp, SRC).replace(os.sep, "/")
                    z.write(fp, f"{ROOT}/{rel}"); n += 1
print("files:", n, "size MB:", round(os.path.getsize(OUT)/1048576, 1))
