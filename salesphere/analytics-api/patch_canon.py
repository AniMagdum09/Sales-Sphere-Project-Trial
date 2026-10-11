"""Patch: canon-aware detect/map for report imports."""
import pathlib
import ast

p = pathlib.Path("app/services/importer.py")
s = p.read_text(encoding="utf-8")

# 1) canonical-name helper + canon-based detection
old = """def detect_kind(df: pd.DataFrame) -> str:
    cols = set(df.columns)"""
new = """def _canon(name) -> str:
    \"\"\"Canonical column key: lowercase, non-alphanumeric runs -> single underscore.\"\"\"
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _canon_columns(df: pd.DataFrame) -> pd.DataFrame:
    \"\"\"Rename columns to their canonical form (spaces/punctuation -> underscore).\"\"\"
    df = df.copy()
    seen = {}
    cols = []
    for c in df.columns:
        k = _canon(c) or f"col{len(cols)}"
        if k in seen:
            seen[k] += 1
            k = f"{k}_{seen[k]}"
        else:
            seen[k] = 0
        cols.append(k)
    df.columns = cols
    return df


def detect_kind(df: pd.DataFrame) -> str:
    cols = {_canon(c) for c in df.columns}"""
assert old in s
s = s.replace(old, new)

# 2) alias matching on canonical form
old = """def map_columns(df: pd.DataFrame, kind: str) -> pd.DataFrame:
    \"\"\"Renames aliased columns to canonical names; drops unmatched columns.\"\"\"
    aliases = ALIASES[kind]
    ren, seen = {}, set()
    for col in df.columns:
        c = col.strip().lower()
        for canon, options in aliases.items():
            if canon in seen:
                continue
            if c in options:
                ren[col] = canon
                seen.add(canon)
                break
    return df.rename(columns=ren)"""
new = """def map_columns(df: pd.DataFrame, kind: str) -> pd.DataFrame:
    \"\"\"Renames aliased columns to canonical names; unmatched columns pass through.\"\"\"
    aliases = ALIASES[kind]
    canon_alias = {k: {_canon(o) for o in opts} for k, opts in aliases.items()}
    ren, seen = {}, set()
    for col in df.columns:
        c = _canon(col)
        for canon, options in canon_alias.items():
            if canon in seen:
                continue
            if c in options:
                ren[col] = canon
                seen.add(canon)
                break
    return df.rename(columns=ren)"""
assert old in s
s = s.replace(old, new)

# 3) report kinds use canon columns, not alias mapping
old = """        k = kind if kind in KINDS else (sheet if sheet in KINDS else None)
        if k is None:
            k = detect_kind(df)
        mapped = map_columns(df, k)"""
new = """        k = kind if kind in KINDS else (sheet if sheet in KINDS else None)
        if k is None:
            k = detect_kind(df)
        if k in ("sales_bills", "purchase_bills", "stock_items"):
            mapped = _canon_columns(df)   # report headers are already canonical words
        else:
            mapped = map_columns(df, k)"""
assert old in s
s = s.replace(old, new)

# 4) month columns survive canon form as 2024_09_01_00_00_00
old = """    month_cols = [c for c in df.columns if re.match(r"^\\d{4}-\\d{2}-\\d{2}", str(c))]"""
new = """    month_cols = [c for c in df.columns if re.match(r"^\\d{4}[_-]\\d{2}[_-]\\d{2}", str(c))]"""
assert old in s
s = s.replace(old, new)

old = """        for mc in month_cols:
            q = clean_num(r.get(mc))
            if q:
                month_rows.append(dict(item_code=code, ym=str(mc)[:10] + "-01", qty=q, value=None))"""
new = """        for mc in month_cols:
            q = clean_num(r.get(mc))
            if q:
                digits = re.findall(r"\\d{4}", str(mc))
                ym = f"{digits[0]}-{digits[1]}-01"
                month_rows.append(dict(item_code=code, ym=ym, qty=q, value=None))"""
assert old in s
s = s.replace(old, new)

ast.parse(s)
p.write_text(s, encoding="utf-8")
print("canon patch OK")
