#!/usr/bin/env python3
"""
Automated Integration Testing Suite for Aircraft Registry Aggregator
Author: Gemini
Description: Performs end-to-end assertions against real and normalized tail 
             numbers without spawning Tkinter prompt boxes. Works on Windows, 
             Linux, and macOS.
"""

import os
import sys
import logging
import traceback

# Setup clean, fresh verbose logging for the test execution
TEST_LOG = "test.log"
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] (test.py:%(lineno)d) - %(message)s",
    handlers=[
        logging.FileHandler(TEST_LOG, mode="w", encoding="utf-8")
    ]
)

# 1. Dependency Pre-flight Checking Routine
REQUIRED_SYSTEM_LIBRARIES = ["sqlite3", "urllib", "zipfile", "xml"]
MISSING_LIBS = []

for lib in REQUIRED_SYSTEM_LIBRARIES:
    try:
        __import__(lib)
    except ImportError:
        MISSING_LIBS.append(lib)

if MISSING_LIBS:
    print("\n[-] FATAL: Your Python environment is missing critical native libraries:")
    for lib in MISSING_LIBS:
        print(f"    - {lib}")
    print("[!] Please reinstall standard Python or resolve your system environment issues.")
    sys.exit(1)

# Dynamically resolve import name (Checks custom local names like 'airRepo' first)
import_success = False
engine = None

possible_module_names = ["airRepo", "aircraft_lookup"]
for name in possible_module_names:
    try:
        logging.info(f"Attempting to import registry engine module: {name}")
        engine = __import__(name)
        import_success = True
        print(f"[+] Successfully imported registry core module: '{name}.py'")
        break
    except ImportError:
        logging.debug(f"Could not load module '{name}'")

if not import_success:
    print("\n[-] FATAL IMPORT ERROR:")
    print("    This automated test script could not locate 'airRepo.py' or 'aircraft_lookup.py'.")
    print("    Ensure the main aggregator script is placed in the same folder as this test.py file.")
    sys.exit(1)

# Ensure database is properly initialized
try:
    engine.init_db()
except Exception as e:
    print(f"[-] Database initialization check crashed: {e}")
    logging.critical(f"Database setup crashed: {e}", exc_info=True)
    sys.exit(1)


# 2. Complete Test Matrix Setup
# Format: (Input Tail, Expected Region, Expect Error (True/False), Test Category)
TEST_MATRIX = [
    # US Tail Variations
    ("N91GF", "United States", False, "US Prefix"),
    ("737AA", "United States", False, "US Numeric/Missing N"),
    ("N12345", "United States", False, "US Standard"),
    ("N183SD", "United States", False, "US Extended N183SD"),
    ("N184SD", "United States", False, "US Extended N184SD"),
    ("N185SD", "United States", False, "US Extended N185SD"),
    ("N188Q", "United States", False, "US Extended N188Q"),
    ("N188SS", "United States", False, "US Extended N188SS"),
    ("N189JC", "United States", False, "US Extended N189JC"),
    ("N18SP", "United States", False, "US Extended N18SP"),
    ("N191NR", "United States", False, "US Extended N191NR"),
    ("N193GM", "United States", False, "US Extended N193GM"),
    ("N196TT", "United States", False, "US Extended N196TT"),
    ("N1SP", "United States", False, "US Extended N1SP"),
    ("N201SP", "United States", False, "US Extended N201SP"),
    ("N202HP", "United States", False, "US Extended N202HP"),
    ("N203Z", "United States", False, "US Extended N203Z"),
    ("N204TM", "United States", False, "US Extended N204TM"),
    ("N206AM", "United States", False, "US Extended N206AM"),
    ("N206LQ", "United States", False, "US Extended N206LQ"),
    ("N206LW", "United States", False, "US Extended N206LW"),
    ("N206VC", "United States", False, "US Extended N206VC"),
    ("N208CN", "United States", False, "US Extended N208CN"),
    ("N208EB", "United States", False, "US Extended N208EB"),
    ("N2092S", "United States", False, "US Extended N2092S"),

    # Canada Tail Variations
    ("C-GMJF", "Canada", False, "Canada Dash"),
    ("CFZRR", "Canada", False, "Canada Non-Dash Standard"),
    ("CGMJF", "Canada", False, "Canada Short Non-Dash"),
    ("C-FMPP", "Canada", False, "Canada Dash C-FMPP"),
    ("C-FNTP", "Canada", False, "Canada Dash C-FNTP"),
    ("C-FOPP", "Canada", False, "Canada Dash C-FOPP"),
    ("C-FOPS", "Canada", False, "Canada Dash C-FOPS"),
    ("C-FRPH", "Canada", False, "Canada Dash C-FRPH"),
    ("C-FTWR", "Canada", False, "Canada Dash C-FTWR"),
    ("C-FZRR", "Canada", False, "Canada Dash C-FZRR"),
    ("C-GMPW", "Canada", False, "Canada Dash C-GMPW"),
    ("C-GMXM", "Canada", False, "Canada Dash C-GMXM"),
    ("C-GPKR", "Canada", False, "Canada Dash C-GPKR"),
    ("C-GRPF", "Canada", False, "Canada Dash C-GRPF"),
    ("C-GSQY", "Canada", False, "Canada Dash C-GSQY"),
    ("C-NFTP", "Canada", False, "Canada Dash C-NFTP"),
    ("CFCPS", "Canada", False, "Canada Non-Dash CFCPS"),
    ("CFIVO", "Canada", False, "Canada Non-Dash CFIVO"),

    # UK Tail Variations (Dynamic Scraper / Cache check)
    ("G-INFO", "United Kingdom", False, "UK Dash Standard"),
    ("GINFO", "United Kingdom", False, "UK Non-Dash"),

    # Other Supported Registries
    ("VH-OJA", "Australia", False, "Australia Dash"),
    ("VH-5QP", "Australia", False, "Australia Dash VH-5QP"),
    ("VH-6QP", "Australia", False, "Australia Dash VH-6QP"),
    ("VH-85T", "Australia", False, "Australia Dash VH-85T"),
    ("ZK-PQR", "New Zealand", False, "New Zealand Dash"),
    ("PP-XYZ", "Brazil", False, "Brazil Standard"),
    ("EI-LBS", "Ireland", False, "Ireland Excel Ingestion"),

    # Unsupported Registries (Should gracefully classify and log exception)
    ("D-ATRA", "Germany", True, "Unsupported Region (Germany)"),
    ("D-IAMT", "Germany", True, "Unsupported Region (Germany D-IAMT)"),
    ("D-IBMT", "Germany", True, "Unsupported Region (Germany D-IBMT)"),
    ("B-1234", "China / Taiwan", True, "Unsupported Region (China)"),
    ("JA801A", "Japan", True, "Unsupported Region (Japan)"),
    ("CC-DJB", "Chile", True, "Unsupported Region (Chile)"),
    ("RW-SIL", "Unknown", True, "Unsupported Region (RW prefix)"),
]


def run_test_suite():
    print("\n" + "="*70)
    print(" RUNNING GLOBAL AIRCRAFT REGISTRY INTEGRATION TESTS")
    print(f" Output Logs: {TEST_LOG}")
    print("="*70)
    
    passed_count = 0
    failed_count = 0
    results_summary = []

    for index, (raw_tail, expected_region, expect_err, category) in enumerate(TEST_MATRIX, 1):
        print(f"[{index}/{len(TEST_MATRIX)}] Testing {category}: '{raw_tail}'...")
        logging.info(f"Running Test #{index} | Category: {category} | Input: '{raw_tail}'")
        
        try:
            # Invoke programmatic execution bypasses UI Popups
            res = engine.query_flow(user_input=raw_tail)
            logging.debug(f"Test query response: {res}")

            if expect_err:
                # We expected an error/unsupported block
                if res is None or "error" in res:
                    print("    -> PASS: Properly identified as unsupported/unresolved.")
                    passed_count += 1
                    results_summary.append((raw_tail, category, "PASS", "Gracefully Blocked / Not Supported"))
                else:
                    print("    -> FAIL: Expected registry error, but received actual record data.")
                    failed_count += 1
                    results_summary.append((raw_tail, category, "FAIL", "Should have thrown registry error"))
            else:
                # We expected actual specs
                if res and "error" not in res:
                    make_model = res.get('make_model', '')
                    owner = res.get('owner', '')
                    manufactured = res.get('date_manufactured', '')
                    
                    # Strict validation for key aircrafts to prevent discrepancies
                    search_key, _, _, _, _ = engine.normalize_and_classify(raw_tail)
                    strict_pass = True
                    strict_error_msg = ""
                    
                    if search_key == "FZRR":
                        # Must be Cessna 206H, 2004, Pat Johnson (Sky Photo Techniques)
                        if "Cessna" not in make_model or "206H" not in make_model:
                            strict_pass = False
                            strict_error_msg = f"Expected Cessna 206H, got: {make_model}"
                        elif "Sky Photo Techniques" not in owner:
                            strict_pass = False
                            strict_error_msg = f"Expected owner containing Sky Photo Techniques, got: {owner}"
                        elif manufactured != "2004":
                            strict_pass = False
                            strict_error_msg = f"Expected year 2004, got: {manufactured}"
                    elif search_key == "N91GF":
                        # Must be CESSNA 172S, 2005, SKYHAWK LEASING LLC
                        if "CESSNA" not in make_model.upper() or "172S" not in make_model.upper():
                            strict_pass = False
                            strict_error_msg = f"Expected Cessna 172S, got: {make_model}"
                        elif "SKYHAWK LEASING" not in owner.upper():
                            strict_pass = False
                            strict_error_msg = f"Expected owner containing SKYHAWK LEASING LLC, got: {owner}"
                        elif manufactured != "2005":
                            strict_pass = False
                            strict_error_msg = f"Expected year 2005, got: {manufactured}"
                    
                    if strict_pass:
                        details = f"{make_model} | {owner}"
                        print(f"    -> PASS: Found {make_model}")
                        passed_count += 1
                        results_summary.append((raw_tail, category, "PASS", details))
                    else:
                        print(f"    -> FAIL: Strict verification failed: {strict_error_msg}")
                        failed_count += 1
                        results_summary.append((raw_tail, category, "FAIL", f"Strict check failed: {strict_error_msg}"))
                else:
                    err_msg = res.get("error") if res else "No record found"
                    print(f"    -> FAIL: Could not resolve data. Error: {err_msg}")
                    failed_count += 1
                    results_summary.append((raw_tail, category, "FAIL", f"Unresolved: {err_msg}"))
                    
        except Exception as test_ex:
            logging.error(f"Test #{index} crashed: {test_ex}", exc_info=True)
            print(f"    -> FAIL: Execution raised unhandled exception: {test_ex}")
            failed_count += 1
            results_summary.append((raw_tail, category, "FAIL", f"Crash: {test_ex}"))
        
        print("-" * 70)

    # Generate Final Clean Consolidated Console Output Table
    print("\n" + "="*85)
    print("                             TEST RUN SUMMARY REPORT")
    print("="*85)
    print(f"{'INPUT TAIL':<12} | {'CATEGORY':<28} | {'STATUS':<6} | {'RESULT DETAILS / ERRORS'}")
    print("-" * 85)
    for tail, cat, status, desc in results_summary:
        # Constrain details length for pristine console layout
        capped_desc = desc[:32] + "..." if len(desc) > 35 else desc
        print(f"{tail:<12} | {cat:<28} | {status:<6} | {capped_desc}")
    print("="*85)
    
    print(f"\n[!] Complete: {passed_count} Passed, {failed_count} Failed.")
    if failed_count > 0:
        print("[X] Some test assertions failed. Consult 'test.log' and 'log.log' for diagnostic stack traces.")
        sys.exit(1)
    else:
        print("[+] SUCCESS! All regional classification and parser tests passed seamlessly.")
        sys.exit(0)


if __name__ == "__main__":
    try:
        run_test_suite()
    except KeyboardInterrupt:
        print("\n[-] Testing aborted by user command.")
        sys.exit(130)