"""Validate the sales dashboard CSV files before calculating KPIs.

Run from the repository root:
    python scripts/validate_data.py
Requires pandas (pip install pandas).
"""
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

BASE_COLUMNS = {
    "Order_ID", "Order_Date", "Customer", "Region",
    "Product", "Sales", "Cost",
}
CLEANED_COLUMNS = BASE_COLUMNS | {"Profit", "Year", "Month"}


def report(label: str, passed: bool, detail: str) -> bool:
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {label}: {detail}")
    return passed


def main() -> int:
    checks_passed = True
    cleaned_path = DATA_DIR / "sales_cleaned.csv"
    new_path = DATA_DIR / "sales_raw_new_2026.csv"

    for path in (cleaned_path, new_path):
        if not path.exists():
            report("File exists", False, f"Missing file: {path.relative_to(ROOT)}")
            checks_passed = False

    if not checks_passed:
        return 1

    cleaned = pd.read_csv(cleaned_path)
    new_data = pd.read_csv(new_path)

    checks_passed &= report(
        "Cleaned schema", CLEANED_COLUMNS.issubset(cleaned.columns),
        f"Required columns present; found {len(cleaned.columns)} columns",
    )
    checks_passed &= report(
        "New-data schema", BASE_COLUMNS.issubset(new_data.columns),
        f"Required source columns present; found {len(new_data.columns)} columns",
    )
    if not checks_passed:
        print("\nFix the missing columns before continuing.")
        return 1

    # Parse dates and numeric fields explicitly so invalid values are detectable.
    for label, frame in (("Cleaned data", cleaned), ("New data", new_data)):
        dates = pd.to_datetime(frame["Order_Date"], errors="coerce")
        checks_passed &= report(
            f"{label} dates", dates.notna().all(),
            f"{dates.isna().sum()} invalid or missing date(s)",
        )

        for column in ("Sales", "Cost"):
            numeric = pd.to_numeric(frame[column], errors="coerce")
            checks_passed &= report(
                f"{label} {column}", numeric.notna().all(),
                f"{numeric.isna().sum()} missing or non-numeric value(s)",
            )
            frame[column] = numeric

        checks_passed &= report(
            f"{label} order IDs", frame["Order_ID"].notna().all(),
            f"{frame['Order_ID'].isna().sum()} missing ID(s)",
        )
        duplicate_ids = int(frame["Order_ID"].duplicated().sum())
        checks_passed &= report(
            f"{label} unique order IDs", duplicate_ids == 0,
            f"{duplicate_ids} duplicate ID(s)",
        )
        missing_dimensions = int(
            frame[["Customer", "Region", "Product"]].isna().any(axis=1).sum()
        )
        checks_passed &= report(
            f"{label} dimensions", missing_dimensions == 0,
            f"{missing_dimensions} row(s) missing customer, region, or product",
        )
        negative_amounts = int(((frame["Sales"] < 0) | (frame["Cost"] < 0)).sum())
        checks_passed &= report(
            f"{label} non-negative amounts", negative_amounts == 0,
            f"{negative_amounts} row(s) with negative sales or cost",
        )

    # Verify calculated fields in the cleaned dataset.
    cleaned_dates = pd.to_datetime(cleaned["Order_Date"], errors="coerce")
    profit = pd.to_numeric(cleaned["Profit"], errors="coerce")
    checks_passed &= report(
        "Profit calculation", (profit == cleaned["Sales"] - cleaned["Cost"]).all(),
        "Profit should equal Sales minus Cost on every row",
    )
    year_month_ok = (
        pd.to_numeric(cleaned["Year"], errors="coerce").eq(cleaned_dates.dt.year)
        & pd.to_numeric(cleaned["Month"], errors="coerce").eq(cleaned_dates.dt.month)
    )
    checks_passed &= report(
        "Year/month consistency", year_month_ok.all(),
        f"{int((~year_month_ok).sum())} row(s) with Year/Month inconsistent with Order_Date",
    )

    cleaned_ids = set(cleaned["Order_ID"].dropna().astype(str))
    new_ids = set(new_data["Order_ID"].dropna().astype(str))
    overlap = cleaned_ids & new_ids
    checks_passed &= report(
        "Cross-file order IDs", len(overlap) == 0,
        f"{len(overlap)} ID(s) appear in both files",
    )

    print("\n--- Summary ---")
    print(f"Cleaned rows: {len(cleaned):,}")
    print(f"New 2026 rows: {len(new_data):,}")
    print(f"Combined rows before any append: {len(cleaned) + len(new_data):,}")
    print(f"Validation result: {'PASS' if checks_passed else 'FAIL'}")
    return 0 if checks_passed else 1


if __name__ == "__main__":
    sys.exit(main())
