"""CSV / Excel data import: upload, templates, history."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from ..services import importer

router = APIRouter(prefix="/api/import", tags=["import"])

MEDIA_CSV = "text/csv; charset=utf-8"


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    kind: str = Form("auto"),
    branch: str = Form(""),
):
    name = file.filename or "upload"
    if not name.lower().endswith((".csv", ".xlsx", ".xlsm")):
        raise HTTPException(400, "Only .csv and .xlsx files are supported")
    if kind not in ("auto", *importer.KINDS):
        raise HTTPException(400, f"Unknown kind '{kind}'")
    branch_code = (branch or "").strip() or None
    if branch_code and len(branch_code) > 2:
        raise HTTPException(400, "branch must be a 2-character code (or empty)")
    raw = await file.read()
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 25 MB)")
    try:
        result = importer.run_import(raw, name, kind, branch_code)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.get("/template")
def template(kind: str = "invoices"):
    if kind == "bulk":
        data = importer.template_bulk_xlsx()
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="SalesSphere_Bulk_Template.xlsx"'},
        )
    if kind not in importer.KINDS:
        raise HTTPException(400, f"Unknown template kind '{kind}'")
    return Response(
        importer.template_csv(kind),
        media_type=MEDIA_CSV,
        headers={"Content-Disposition": f'attachment; filename="SalesSphere_{kind}_template.csv"'},
    )


@router.get("/history")
def history():
    return importer.import_history()


@router.delete("/runs/{run_id}")
def delete_run(run_id: int):
    try:
        return importer.delete_run(run_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/erase-all")
def erase_all():
    return importer.erase_all()
