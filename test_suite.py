#!/usr/bin/env python3
"""
=============================================================
 IERG4210 Phase 1-6 Complete Automated Test Suite
 Usage:
   python test_suite.py                        # localhost:3001
   BASE_URL=https://20.74.81.143 python test_suite.py
   BASE_URL=https://20.74.81.143 ADMIN_EMAIL=admin@shop.com python test_suite.py
=============================================================
"""

import requests
import sys
import os
import random
import string
import json
import time
from collections import Counter
from urllib.parse import urljoin

# ── Suppress SSL warnings for self-signed certs ──────────────
try:
    from urllib3.exceptions import InsecureRequestWarning
    requests.packages.urllib3.disable_warnings(InsecureRequestWarning)
except Exception:
    pass

# =============================================================
# CONFIGURATION  (override via environment variables)
# =============================================================
BASE_URL       = os.environ.get("BASE_URL",       "http://localhost:3001")
ADMIN_EMAIL    = os.environ.get("ADMIN_EMAIL",    "admin@shop.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@1234")
USER_EMAIL     = os.environ.get("USER_EMAIL",     "alice@shop.com")
USER_PASSWORD  = os.environ.get("USER_PASSWORD",  "User@1234")

TIMEOUT = 10   # seconds per request

# =============================================================
# TEST RUNNER
# =============================================================
_results = []
_passed  = 0
_failed  = 0
_warned  = 0

def test(phase: str, name: str, condition: bool, detail: str = "", warn: bool = False):
    global _passed, _failed, _warned
    if condition:
        status = "PASS";  _passed += 1
    elif warn:
        status = "WARN";  _warned += 1
    else:
        status = "FAIL";  _failed += 1
    _results.append((phase, name, status, detail))
    icon = "✅" if condition else ("⚠️ " if warn else "❌")
    print(f"  {icon} [{phase}] {name}")
    if not condition and detail:
        print(f"        → {detail}")

# =============================================================
# HELPERS
# =============================================================
def url(path: str) -> str:
    return urljoin(BASE_URL, path)

def new_session() -> requests.Session:
    s = requests.Session()
    s.verify = False
    return s

def get_csrf(s: requests.Session) -> str:
    try:
        r = s.get(url("/api/csrf-token"), timeout=TIMEOUT)
        return r.json().get("csrfToken", "")
    except Exception:
        return ""

def login(s: requests.Session, email: str, password: str) -> bool:
    try:
        csrf = get_csrf(s)
        r = s.post(url("/api/login"),
                   json={"email": email, "password": password},
                   headers={"x-csrf-token": csrf},
                   timeout=TIMEOUT)
        return r.status_code == 200 and r.json().get("success") is True
    except Exception:
        return False

def logout(s: requests.Session):
    try:
        csrf = get_csrf(s)
        s.post(url("/api/logout"), headers={"x-csrf-token": csrf}, timeout=TIMEOUT)
    except Exception:
        pass

def rand_email() -> str:
    tag = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"autotest_{tag}@test.com"

def get_products(session):
    r = session.get(url("/api/products"), timeout=TIMEOUT)
    if r.status_code != 200:
        return []
    raw = r.json()
    return raw["products"] if isinstance(raw, dict) else raw


# =============================================================
print()
print("═" * 62)
print("  IERG4210  Phase 1–5  Automated Test Suite")
print(f"  Target : {BASE_URL}")
print("═" * 62)


# =============================================================
# PHASE 1 — Layout & Frontend
# =============================================================
print("\n── Phase 1 : Layout & Frontend ─────────────────────────")

s0 = new_session()

# 1-01  Homepage loads
try:
    r = s0.get(url("/"), timeout=TIMEOUT)
    test("P1", "Homepage returns HTTP 200", r.status_code == 200,
         f"Got {r.status_code}")
except Exception as e:
    test("P1", "Homepage returns HTTP 200", False, str(e))

# 1-02  At least 2 categories
categories = []
try:
    r = s0.get(url("/api/categories"), timeout=TIMEOUT)
    categories = r.json() if r.status_code == 200 else []
    test("P1", "At least 2 categories in DB", len(categories) >= 2,
         f"Found {len(categories)} — need ≥ 2")
except Exception as e:
    test("P1", "At least 2 categories in DB", False, str(e))

# 1-03  At least 2 products per category
products = []
try:
    r = s0.get(url("/api/products"), timeout=TIMEOUT)
    raw      = r.json() if r.status_code == 200 else []
    products = raw["products"] if isinstance(raw, dict) else raw
    counts   = Counter(p["catid"] for p in products)
    ok       = len(counts) >= 2 and all(v >= 2 for v in counts.values())
    test("P1", "≥ 2 products per category", ok,
         f"Per-category counts: {dict(counts)}")
except Exception as e:
    test("P1", "≥ 2 products per category", False, str(e))

# 1-04  Product detail API returns all required fields
try:
    if products:
        pid = products[0]["pid"]
        r   = s0.get(url(f"/api/product/{pid}"), timeout=TIMEOUT)
        p   = r.json()
        required = {"pid", "name", "price", "description", "image", "catid"}
        missing  = required - set(p.keys())
        test("P1", "Product detail API has all required fields",
             r.status_code == 200 and not missing,
             f"Missing fields: {missing}" if missing else "")
    else:
        test("P1", "Product detail API has all required fields", False, "No products found")
except Exception as e:
    test("P1", "Product detail API has all required fields", False, str(e))

# 1-05  product.html page is served
try:
    r = s0.get(url("/product.html"), timeout=TIMEOUT)
    test("P1", "product.html page accessible", r.status_code == 200,
         f"Got {r.status_code}")
except Exception as e:
    test("P1", "product.html page accessible", False, str(e))

# 1-06  Category filter returns only matching products
try:
    if categories:
        catid = categories[0]["catid"]
        r     = s0.get(url(f"/api/products?catid={catid}"), timeout=TIMEOUT)
        raw   = r.json() if r.status_code == 200 else []
        items = raw["products"] if isinstance(raw, dict) else raw
        ok    = len(items) > 0 and all(p["catid"] == catid for p in items)
        test("P1", "Category filter returns only correct products", ok,
             f"catid={catid}, returned {len(items)} items")
    else:
        test("P1", "Category filter", False, "No categories to test with")
except Exception as e:
    test("P1", "Category filter", False, str(e))

# 1-07  Invalid catid rejected
try:
    r = s0.get(url("/api/products?catid=abc"), timeout=TIMEOUT)
    test("P1", "Non-numeric catid returns 400", r.status_code == 400,
         f"Got {r.status_code}")
except Exception as e:
    test("P1", "Non-numeric catid rejected", False, str(e))

# 1-08  Non-existent product returns 404
try:
    r = s0.get(url("/api/product/999999"), timeout=TIMEOUT)
    test("P1", "Non-existent product returns 404", r.status_code == 404,
         f"Got {r.status_code}")
except Exception as e:
    test("P1", "Non-existent product returns 404", False, str(e))


# =============================================================
# PHASE 2A — Secure Server Setup
# =============================================================
print("\n── Phase 2A : Secure Server Setup ──────────────────────")

try:
    r       = s0.get(url("/"), timeout=TIMEOUT)
    hdrs    = r.headers
    hdr_lc  = {k.lower(): v for k, v in hdrs.items()}

    # 2A-01  X-Powered-By hidden
    test("P2A", "X-Powered-By header absent",
         "x-powered-by" not in hdr_lc,
         f"Exposed: {hdr_lc.get('x-powered-by', '')}")

    # 2A-02  Server version not leaked
    srv = hdr_lc.get("server", "")
    leaked = any(v in srv.lower() for v in ["nginx/", "apache/", "node", "express", "iis/"])
    test("P2A", "Server version not leaked in header",
         not leaked,
         f"Server: '{srv}' — remove version number")

    # 2A-03  HTTPS (warning only for HTTP base)
    is_https = BASE_URL.startswith("https")
    test("P2A", "Server reachable over HTTPS",
         is_https, "Currently testing over HTTP — deploy requires HTTPS", warn=not is_https)

except Exception as e:
    test("P2A", "Secure server header checks", False, str(e))


# =============================================================
# PHASE 2B — Admin Panel & CRUD
# =============================================================
print("\n── Phase 2B : Admin Panel & CRUD ────────────────────────")

# 2B-01  Unauthenticated access to /admin is blocked
try:
    anon = new_session()
    r    = anon.get(url("/admin"), timeout=TIMEOUT, allow_redirects=False)
    test("P2B", "/admin blocked for unauthenticated user",
         r.status_code in {302, 401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P2B", "/admin blocked for unauthenticated user", False, str(e))

# 2B-02  Admin login
admin_s = new_session()
admin_ok = login(admin_s, ADMIN_EMAIL, ADMIN_PASSWORD)
test("P2B", "Admin login succeeds", admin_ok,
     f"Check ADMIN_EMAIL={ADMIN_EMAIL} and ADMIN_PASSWORD")

# 2B-03  Admin can reach /admin
try:
    r = admin_s.get(url("/admin"), timeout=TIMEOUT)
    test("P2B", "Admin can access /admin after login",
         r.status_code == 200, f"Got {r.status_code}")
except Exception as e:
    test("P2B", "Admin can access /admin after login", False, str(e))

# 2B-04  Create category
new_cat_id = None
try:
    csrf = get_csrf(admin_s)
    r    = admin_s.post(url("/api/categories"),
                        json={"name": "AutoTest_Category"},
                        headers={"x-csrf-token": csrf},
                        timeout=TIMEOUT)
    new_cat_id = r.json().get("catid") if r.status_code == 201 else None
    test("P2B", "Admin can create a category",
         r.status_code == 201, f"Got {r.status_code}: {r.text[:120]}")
except Exception as e:
    test("P2B", "Admin can create a category", False, str(e))

# 2B-05  Update category
if new_cat_id:
    try:
        csrf = get_csrf(admin_s)
        r    = admin_s.put(url(f"/api/categories/{new_cat_id}"),
                           json={"name": "AutoTest_Updated"},
                           headers={"x-csrf-token": csrf},
                           timeout=TIMEOUT)
        test("P2B", "Admin can update a category",
             r.status_code == 200, f"Got {r.status_code}")
    except Exception as e:
        test("P2B", "Admin can update a category", False, str(e))

# 2B-06  Create product (no image)
new_pid = None
if new_cat_id:
    try:
        csrf = get_csrf(admin_s)
        r    = admin_s.post(url("/api/products"),
                            data={"catid": str(new_cat_id),
                                  "name": "AutoTest_Product",
                                  "price": "9.99",
                                  "description": "test product"},
                            headers={"x-csrf-token": csrf},
                            timeout=TIMEOUT)
        new_pid = r.json().get("pid") if r.status_code == 201 else None
        test("P2B", "Admin can create a product",
             r.status_code == 201, f"Got {r.status_code}: {r.text[:120]}")
    except Exception as e:
        test("P2B", "Admin can create a product", False, str(e))

# 2B-07  Update product
if new_pid and new_cat_id:
    try:
        csrf = get_csrf(admin_s)
        r    = admin_s.put(url(f"/api/products/{new_pid}"),
                           data={"catid": str(new_cat_id),
                                 "name": "AutoTest_Updated",
                                 "price": "19.99",
                                 "description": "updated"},
                           headers={"x-csrf-token": csrf},
                           timeout=TIMEOUT)
        test("P2B", "Admin can update a product",
             r.status_code == 200, f"Got {r.status_code}")
    except Exception as e:
        test("P2B", "Admin can update a product", False, str(e))

# 2B-08  Non-admin blocked from admin API
try:
    user_s2 = new_session()
    login(user_s2, USER_EMAIL, USER_PASSWORD)
    csrf = get_csrf(user_s2)
    r    = user_s2.post(url("/api/categories"),
                        json={"name": "HackerCat"},
                        headers={"x-csrf-token": csrf},
                        timeout=TIMEOUT)
    test("P2B", "Non-admin blocked from POST /api/categories",
         r.status_code in {401, 403},
         f"Got {r.status_code} — non-admin should be blocked")
except Exception as e:
    test("P2B", "Non-admin blocked from admin API", False, str(e))

# 2B-09  Delete product (cleanup)
if new_pid:
    try:
        csrf = get_csrf(admin_s)
        r    = admin_s.delete(url(f"/api/products/{new_pid}"),
                              headers={"x-csrf-token": csrf}, timeout=TIMEOUT)
        test("P2B", "Admin can delete a product",
             r.status_code == 200, f"Got {r.status_code}")
    except Exception as e:
        test("P2B", "Admin can delete a product", False, str(e))

# 2B-10  Delete category (cleanup)
if new_cat_id:
    try:
        csrf = get_csrf(admin_s)
        r    = admin_s.delete(url(f"/api/categories/{new_cat_id}"),
                              headers={"x-csrf-token": csrf}, timeout=TIMEOUT)
        test("P2B", "Admin can delete a category",
             r.status_code == 200, f"Got {r.status_code}")
    except Exception as e:
        test("P2B", "Admin can delete a category", False, str(e))


# =============================================================
# PHASE 3 — User Authentication
# =============================================================
print("\n── Phase 3 : User Authentication ───────────────────────")

TEST_EMAIL = rand_email()
TEST_PASS  = "AutoTest@9988"

# 3-01  Register new user
reg_s = new_session()
try:
    csrf = get_csrf(reg_s)
    r    = reg_s.post(url("/api/register"),
                      json={"name": "AutoTestUser", "email": TEST_EMAIL,
                            "password": TEST_PASS, "confirmPassword": TEST_PASS},
                      headers={"x-csrf-token": csrf},
                      timeout=TIMEOUT)
    test("P3", "New user registration succeeds (201)",
         r.status_code == 201, f"Got {r.status_code}: {r.text[:120]}")
except Exception as e:
    test("P3", "New user registration succeeds", False, str(e))

# 3-02  Duplicate registration rejected
try:
    csrf = get_csrf(reg_s)
    r    = reg_s.post(url("/api/register"),
                      json={"name": "AutoTestUser2", "email": TEST_EMAIL,
                            "password": TEST_PASS, "confirmPassword": TEST_PASS},
                      headers={"x-csrf-token": csrf},
                      timeout=TIMEOUT)
    test("P3", "Duplicate email registration rejected (409)",
         r.status_code == 409, f"Got {r.status_code}")
except Exception as e:
    test("P3", "Duplicate email registration rejected", False, str(e))

# 3-03  Weak password rejected
try:
    weak_s = new_session()
    csrf   = get_csrf(weak_s)
    r      = weak_s.post(url("/api/register"),
                         json={"name": "Weak", "email": rand_email(),
                               "password": "password", "confirmPassword": "password"},
                         headers={"x-csrf-token": csrf},
                         timeout=TIMEOUT)
    test("P3", "Weak password rejected at registration (400)",
         r.status_code in {400, 422},
         f"Got {r.status_code} — 'password' should be rejected")
except Exception as e:
    test("P3", "Weak password rejected at registration", False, str(e))

# 3-04  Mismatched passwords rejected
try:
    mis_s = new_session()
    csrf  = get_csrf(mis_s)
    r     = mis_s.post(url("/api/register"),
                       json={"name": "Mis", "email": rand_email(),
                             "password": "StrongPass@1", "confirmPassword": "StrongPass@2"},
                       headers={"x-csrf-token": csrf},
                       timeout=TIMEOUT)
    test("P3", "Mismatched passwords rejected at registration (400)",
         r.status_code == 400, f"Got {r.status_code}")
except Exception as e:
    test("P3", "Mismatched passwords rejected", False, str(e))

# 3-05  Login with newly registered user
new_user_s = new_session()
new_user_ok = login(new_user_s, TEST_EMAIL, TEST_PASS)
test("P3", "Newly registered user can log in", new_user_ok)

# 3-06  /api/me returns user data while logged in
try:
    r    = new_user_s.get(url("/api/me"), timeout=TIMEOUT)
    data = r.json()
    test("P3", "/api/me returns name for logged-in user",
         r.status_code == 200 and data.get("name") is not None,
         str(data))
except Exception as e:
    test("P3", "/api/me returns name", False, str(e))

# 3-07  isAdmin is False for regular user
try:
    r    = new_user_s.get(url("/api/me"), timeout=TIMEOUT)
    data = r.json()
    test("P3", "Regular user has isAdmin=False",
         data.get("isAdmin") is False,
         f"isAdmin={data.get('isAdmin')}")
except Exception as e:
    test("P3", "Regular user isAdmin flag check", False, str(e))

# 3-08  Wrong password rejected
try:
    bad_s = new_session()
    csrf  = get_csrf(bad_s)
    r     = bad_s.post(url("/api/login"),
                       json={"email": ADMIN_EMAIL, "password": "WrongPass!999"},
                       headers={"x-csrf-token": csrf},
                       timeout=TIMEOUT)
    test("P3", "Wrong password rejected (401)",
         r.status_code == 401, f"Got {r.status_code}")
except Exception as e:
    test("P3", "Wrong password rejected", False, str(e))

# 3-09  Change password blocked for unauthenticated user
try:
    anon_cp = new_session()
    csrf    = get_csrf(anon_cp)
    r       = anon_cp.post(url("/api/change-password"),
                           json={"currentPassword": "x",
                                 "newPassword": "NewPass@11",
                                 "confirmPassword": "NewPass@11"},
                           headers={"x-csrf-token": csrf},
                           timeout=TIMEOUT)
    test("P3", "Change-password blocked for unauthenticated (401)",
         r.status_code in {401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P3", "Change-password requires auth", False, str(e))

# 3-10  Change password — wrong current password rejected
try:
    chg_s = new_session()
    login(chg_s, TEST_EMAIL, TEST_PASS)
    csrf  = get_csrf(chg_s)
    r     = chg_s.post(url("/api/change-password"),
                       json={"currentPassword": "WrongCurrent@1",
                             "newPassword": "NewPass@2026",
                             "confirmPassword": "NewPass@2026"},
                       headers={"x-csrf-token": csrf},
                       timeout=TIMEOUT)
    test("P3", "Change-password: wrong current password rejected (401)",
         r.status_code == 401, f"Got {r.status_code}")
except Exception as e:
    test("P3", "Change-password rejects wrong current password", False, str(e))

# 3-11  Logout destroys session
try:
    logout(new_user_s)
    r    = new_user_s.get(url("/api/me"), timeout=TIMEOUT)
    data = r.json()
    test("P3", "Session destroyed after logout (/api/me returns null name)",
         data.get("name") is None,
         f"name={data.get('name')} — should be null")
except Exception as e:
    test("P3", "Session destroyed after logout", False, str(e))


# =============================================================
# PHASE 4 — Security
# =============================================================
print("\n── Phase 4 : Security ───────────────────────────────────")

try:
    r    = requests.get(url("/"), verify=False, timeout=TIMEOUT)
    hdrs = {k.lower(): v for k, v in r.headers.items()}

    # 4-01  CSP present
    csp = hdrs.get("content-security-policy", "")
    test("P4", "Content-Security-Policy header present",
         bool(csp), "CSP header missing entirely")

    # 4-02  CSP default-src
    test("P4", "CSP contains default-src 'self'",
         "default-src" in csp and "'self'" in csp,
         f"CSP: {csp[:120]}")

    # 4-03  CSP blocks unsafe-inline in script-src
    # safe if script-src has 'self' without 'unsafe-inline'
    if "script-src" in csp:
        # get the script-src directive value
        script_part = csp.split("script-src")[1].split(";")[0]
        unsafe_script = "unsafe-inline" in script_part
    else:
        unsafe_script = "unsafe-inline" in csp  # broad check
    test("P4", "CSP: unsafe-inline NOT in script-src",
         not unsafe_script,
         "Remove 'unsafe-inline' from script-src — XSS risk")

    # 4-04  object-src none
    test("P4", "CSP contains object-src 'none'",
         "object-src" in csp and "'none'" in csp,
         f"Add object-src 'none' to CSP")

    # 4-05  X-Content-Type-Options
    xcto = hdrs.get("x-content-type-options", "")
    test("P4", "X-Content-Type-Options: nosniff",
         xcto.lower() == "nosniff",
         f"Got: '{xcto}'")

    # 4-06  X-Frame-Options
    xfo = hdrs.get("x-frame-options", "").upper()
    test("P4", "X-Frame-Options: DENY or SAMEORIGIN",
         xfo in {"DENY", "SAMEORIGIN"},
         f"Got: '{xfo}'")

    # 4-07  HSTS (only meaningful over HTTPS)
    hsts = hdrs.get("strict-transport-security", "")
    if BASE_URL.startswith("https"):
        test("P4", "Strict-Transport-Security header present (HTTPS)",
             bool(hsts), "HSTS missing — uncomment the header in server.js")
    else:
        test("P4", "HSTS header (skipped — not HTTPS)",
             True, warn=True)

except Exception as e:
    test("P4", "Security headers block", False, str(e))

# 4-08  CSRF: request with no token is rejected (403)
try:
    no_tok = new_session()
    r = no_tok.post(url("/api/login"),
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                    timeout=TIMEOUT)  # no x-csrf-token header
    test("P4", "POST without CSRF token rejected (403)",
         r.status_code == 403, f"Got {r.status_code}")
except Exception as e:
    test("P4", "POST without CSRF token rejected", False, str(e))

# 4-09  CSRF: forged token rejected (403)
try:
    fake_tok = new_session()
    r = fake_tok.post(url("/api/login"),
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      headers={"x-csrf-token": "aabbccddeeff00112233445566778899"},
                      timeout=TIMEOUT)
    test("P4", "POST with forged CSRF token rejected (403)",
         r.status_code == 403, f"Got {r.status_code}")
except Exception as e:
    test("P4", "Forged CSRF token rejected", False, str(e))

# 4-10  SQL injection in product ID rejected
try:
    r = s0.get(url("/api/product/1 OR 1=1"), timeout=TIMEOUT)
    test("P4", "SQL injection in product ID rejected (400/404)",
         r.status_code in {400, 404},
         f"Got {r.status_code}")
except Exception as e:
    test("P4", "SQL injection in product ID", False, str(e))

# 4-11  SQL injection as query param rejected
try:
    r = s0.get(url("/api/products?catid=1%20OR%201%3D1"), timeout=TIMEOUT)
    test("P4", "SQL injection in catid query param rejected (400)",
         r.status_code == 400,
         f"Got {r.status_code}")
except Exception as e:
    test("P4", "SQL injection in catid param", False, str(e))

# 4-12  Non-numeric product ID rejected
try:
    r = s0.get(url("/api/product/abc"), timeout=TIMEOUT)
    test("P4", "Non-numeric product ID rejected (400)",
         r.status_code == 400, f"Got {r.status_code}")
except Exception as e:
    test("P4", "Non-numeric product ID rejected", False, str(e))

# 4-13  XSS: script tag in category name is rejected or stripped
try:
    xss_s  = new_session()
    ok     = login(xss_s, ADMIN_EMAIL, ADMIN_PASSWORD)
    csrf   = get_csrf(xss_s)
    r      = xss_s.post(url("/api/categories"),
                        json={"name": "<script>alert(1)</script>"},
                        headers={"x-csrf-token": csrf},
                        timeout=TIMEOUT)
    if r.status_code == 201:
        # Was accepted — check it was sanitised
        new_id   = r.json().get("catid")
        r2       = xss_s.get(url("/api/categories"), timeout=TIMEOUT)
        cats_now = {c["catid"]: c["name"] for c in r2.json()}
        stored   = cats_now.get(new_id, "")
        is_clean = "<script>" not in stored.lower()
        test("P4", "XSS script tag stripped from category name",
             is_clean, f"Stored name: '{stored}'")
        # cleanup
        csrf2 = get_csrf(xss_s)
        xss_s.delete(url(f"/api/categories/{new_id}"),
                     headers={"x-csrf-token": csrf2}, timeout=TIMEOUT)
    else:
        # Server rejected it entirely — also fine
        test("P4", "XSS script tag in category name blocked by server",
             True, f"Server returned {r.status_code} (rejected payload)")
except Exception as e:
    test("P4", "XSS in category name", False, str(e))

# 4-14  Protected pages require auth
for path, label in [("/change-password", "change-password"), ("/orders", "orders")]:
    try:
        anon_pg = new_session()
        r = anon_pg.get(url(path), timeout=TIMEOUT, allow_redirects=False)
        test("P4", f"/{label} page requires auth (redirect/401/403)",
             r.status_code in {302, 401, 403},
             f"Got {r.status_code}")
    except Exception as e:
        test("P4", f"/{label} requires auth", False, str(e))


# =============================================================
# PHASE 5 — Stripe Checkout & Orders
# =============================================================
print("\n── Phase 5 : Checkout & Orders ──────────────────────────")

# 5-01  Checkout blocked for unauthenticated users
try:
    anon_co = new_session()
    csrf    = get_csrf(anon_co)
    r       = anon_co.post(url("/api/checkout"),
                           json={"items": [{"pid": 1, "qty": 1}]},
                           headers={"x-csrf-token": csrf},
                           timeout=TIMEOUT)
    test("P5", "Checkout blocked for unauthenticated user (401/403)",
         r.status_code in {401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P5", "Checkout requires auth", False, str(e))

# 5-02  Checkout rejected with empty items array
try:
    co_s = new_session()
    login(co_s, USER_EMAIL, USER_PASSWORD)
    csrf = get_csrf(co_s)
    r    = co_s.post(url("/api/checkout"),
                     json={"items": []},
                     headers={"x-csrf-token": csrf},
                     timeout=TIMEOUT)
    test("P5", "Checkout with empty cart rejected (400)",
         r.status_code == 400,
         f"Got {r.status_code}")
except Exception as e:
    test("P5", "Checkout with empty cart rejected", False, str(e))

# 5-03  Checkout rejected with non-existent product
try:
    co_s2 = new_session()
    login(co_s2, USER_EMAIL, USER_PASSWORD)
    csrf  = get_csrf(co_s2)
    r     = co_s2.post(url("/api/checkout"),
                       json={"items": [{"pid": 999999, "qty": 1}]},
                       headers={"x-csrf-token": csrf},
                       timeout=TIMEOUT)
    test("P5", "Checkout with non-existent pid rejected (400/404)",
         r.status_code in {400, 404},
         f"Got {r.status_code}")
except Exception as e:
    test("P5", "Checkout with invalid pid rejected", False, str(e))

# 5-04  Checkout rejected with invalid qty (0 or negative)
try:
    co_s3 = new_session()
    login(co_s3, USER_EMAIL, USER_PASSWORD)
    prods = get_products(co_s3)
    if prods:
        csrf = get_csrf(co_s3)
        r    = co_s3.post(url("/api/checkout"),
                          json={"items": [{"pid": prods[0]["pid"], "qty": 0}]},
                          headers={"x-csrf-token": csrf},
                          timeout=TIMEOUT)
        test("P5", "Checkout with qty=0 rejected (400)",
             r.status_code == 400,
             f"Got {r.status_code}")
    else:
        test("P5", "Checkout qty=0 validation (no products — skipped)", True, warn=True)
except Exception as e:
    test("P5", "Checkout with qty=0 rejected", False, str(e))

# 5-05  Checkout with valid items returns Stripe URL
try:
    co_s4 = new_session()
    login(co_s4, USER_EMAIL, USER_PASSWORD)
    prods = get_products(co_s4)
    if prods:
        csrf = get_csrf(co_s4)
        r    = co_s4.post(url("/api/checkout"),
                          json={"items": [{"pid": prods[0]["pid"], "qty": 1}]},
                          headers={"x-csrf-token": csrf},
                          timeout=TIMEOUT)
        if r.status_code == 200:
            checkout_url = r.json().get("url", "")
            is_stripe    = "stripe.com" in checkout_url
            test("P5", "Valid checkout returns Stripe redirect URL",
                 is_stripe, f"URL: {checkout_url[:80]}")
        else:
            # Stripe keys may not be set in this environment
            test("P5", "Valid checkout returns Stripe URL (check STRIPE keys if fails)",
                 False, f"Got {r.status_code}: {r.text[:150]}", warn=True)
    else:
        test("P5", "Valid checkout (no products — skipped)", True, warn=True)
except Exception as e:
    test("P5", "Valid checkout returns Stripe URL", False, str(e), warn=True)

# 5-06  Server ignores client-supplied price (only pid+qty used)
#  We cannot directly observe the stored price, but we can verify the
#  server does NOT crash and does NOT return a price matching our fake input.
try:
    co_s5 = new_session()
    login(co_s5, USER_EMAIL, USER_PASSWORD)
    prods = get_products(co_s5)
    if prods:
        csrf     = get_csrf(co_s5)
        real_pid = prods[0]["pid"]
        r        = co_s5.post(url("/api/checkout"),
                              json={"items": [{"pid": real_pid, "qty": 1, "price": 0.01}]},
                              headers={"x-csrf-token": csrf},
                              timeout=TIMEOUT)
        # Server must not error because of extra field, and should still create order at real price
        test("P5", "Checkout does not crash when client sends fake price field",
             r.status_code in {200, 302},
             f"Got {r.status_code}: {r.text[:150]}", warn=(r.status_code != 200))
    else:
        test("P5", "Server ignores client price (no products — skipped)", True, warn=True)
except Exception as e:
    test("P5", "Server ignores client price injection", False, str(e), warn=True)

# 5-07  Webhook endpoint is registered (not 404)
try:
    r = requests.post(url("/api/webhook"),
                      data=b'{"type":"test"}',
                      headers={"Content-Type": "application/json",
                               "stripe-signature": "t=0,v1=fake"},
                      verify=False, timeout=TIMEOUT)
    test("P5", "Webhook /api/webhook endpoint exists (not 404)",
         r.status_code != 404,
         f"Got {r.status_code} — 404 means the route is not registered")
except Exception as e:
    test("P5", "Webhook endpoint exists", False, str(e))

# 5-08  Webhook with bad signature returns 400 (not 200 or 500)
try:
    r = requests.post(url("/api/webhook"),
                      data=b'{"type":"checkout.session.completed"}',
                      headers={"Content-Type": "application/json",
                               "stripe-signature": "t=0,v1=fakesignature"},
                      verify=False, timeout=TIMEOUT)
    test("P5", "Webhook with invalid Stripe signature returns 400",
         r.status_code == 400,
         f"Got {r.status_code} — must be 400 to prove signature verification is running")
except Exception as e:
    test("P5", "Webhook signature verification returns 400", False, str(e))

# 5-09  /api/my-orders blocked for unauthenticated
try:
    anon_mo = new_session()
    r       = anon_mo.get(url("/api/my-orders"), timeout=TIMEOUT)
    test("P5", "/api/my-orders blocked for unauthenticated (401/403)",
         r.status_code in {401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P5", "/api/my-orders requires auth", False, str(e))

# 5-10  /api/my-orders returns JSON array for logged-in user
try:
    mo_s = new_session()
    login(mo_s, USER_EMAIL, USER_PASSWORD)
    r    = mo_s.get(url("/api/my-orders"), timeout=TIMEOUT)
    data = r.json() if r.status_code == 200 else None
    test("P5", "/api/my-orders returns JSON array for logged-in user",
         r.status_code == 200 and isinstance(data, list),
         f"Got {r.status_code}, type={type(data)}")
except Exception as e:
    test("P5", "/api/my-orders returns array", False, str(e))

# 5-11  /api/my-orders returns at most 5 orders
try:
    mo_s2 = new_session()
    login(mo_s2, USER_EMAIL, USER_PASSWORD)
    r     = mo_s2.get(url("/api/my-orders"), timeout=TIMEOUT)
    if r.status_code == 200:
        orders = r.json()
        test("P5", "/api/my-orders returns at most 5 orders",
             len(orders) <= 5,
             f"Returned {len(orders)} orders — must cap at 5")
    else:
        test("P5", "/api/my-orders limit check", False, f"Got {r.status_code}")
except Exception as e:
    test("P5", "/api/my-orders limit check", False, str(e))

# 5-12  /api/admin/orders blocked for regular user
try:
    reg_s2 = new_session()
    login(reg_s2, USER_EMAIL, USER_PASSWORD)
    r      = reg_s2.get(url("/api/admin/orders"), timeout=TIMEOUT)
    test("P5", "/api/admin/orders blocked for non-admin (401/403)",
         r.status_code in {401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P5", "/api/admin/orders blocked for non-admin", False, str(e))

# 5-13  /api/admin/orders accessible for admin
try:
    adm_s2 = new_session()
    login(adm_s2, ADMIN_EMAIL, ADMIN_PASSWORD)
    r      = adm_s2.get(url("/api/admin/orders"), timeout=TIMEOUT)
    test("P5", "/api/admin/orders accessible for admin (200 + array)",
         r.status_code == 200 and isinstance(r.json(), list),
         f"Got {r.status_code}")
except Exception as e:
    test("P5", "/api/admin/orders accessible for admin", False, str(e))

# 5-14  /orders page requires auth
try:
    anon_op = new_session()
    r       = anon_op.get(url("/orders"), timeout=TIMEOUT, allow_redirects=False)
    test("P5", "/orders page blocked for unauthenticated (redirect/401/403)",
         r.status_code in {302, 401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P5", "/orders page requires auth", False, str(e))

# 5-15  /orders page accessible for logged-in user
try:
    ord_s = new_session()
    login(ord_s, USER_EMAIL, USER_PASSWORD)
    r     = ord_s.get(url("/orders"), timeout=TIMEOUT)
    test("P5", "/orders page accessible for logged-in user (200)",
         r.status_code == 200, f"Got {r.status_code}")
except Exception as e:
    test("P5", "/orders page accessible for logged-in user", False, str(e))

# 5-16  orders.html HTML structure — required element IDs
try:
    ord_s2 = new_session()
    login(ord_s2, USER_EMAIL, USER_PASSWORD)
    r      = ord_s2.get(url("/orders"), timeout=TIMEOUT)
    html   = r.text if r.status_code == 200 else ""
    for elem_id, label in [
        ("success-banner",   "#success-banner element"),
        ("cancelled-banner", "#cancelled-banner element"),
        ("orders-container", "#orders-container element"),
    ]:
        test("P5", f"orders.html contains {label}",
             elem_id in html,
             f"id='{elem_id}' not found in HTML")
except Exception as e:
    test("P5", "orders.html HTML structure", False, str(e))

# 5-17  orders.html loads orders.js
try:
    ord_s3 = new_session()
    login(ord_s3, USER_EMAIL, USER_PASSWORD)
    r      = ord_s3.get(url("/orders"), timeout=TIMEOUT)
    html   = r.text if r.status_code == 200 else ""
    test("P5", "orders.html loads orders.js script",
         "orders.js" in html,
         "orders.js script tag not found in orders.html")
except Exception as e:
    test("P5", "orders.html loads orders.js", False, str(e))

# 5-18  My Orders link present in user nav (userStatus)
#  We check that /orders is linked somewhere in the homepage HTML for a logged-in user
try:
    nav_s = new_session()
    login(nav_s, USER_EMAIL, USER_PASSWORD)
    r     = nav_s.get(url("/"), timeout=TIMEOUT)
    html  = r.text if r.status_code == 200 else ""
    test("P5", 'Homepage nav contains "My Orders" link (/orders) for logged-in user',
         'href="/orders"' in html or "href='/orders'" in html,
         'href="/orders" not found in homepage HTML — check index.html has the static anchor tag')
except Exception as e:
    test("P5", "My Orders link in nav", False, str(e))


# 5-19  Admin panel HTML contains orders table
try:
    adm_s3 = new_session()
    login(adm_s3, ADMIN_EMAIL, ADMIN_PASSWORD)
    r      = adm_s3.get(url("/admin"), timeout=TIMEOUT)
    html   = r.text if r.status_code == 200 else ""
    test("P5", "Admin panel HTML contains orders-table-body element",
         "orders-table-body" in html,
         "id='orders-table-body' not found in admin.html")
except Exception as e:
    test("P5", "Admin panel has orders table", False, str(e))

# 5-20  Checkout stores session email (not name) — indirect check via admin orders
#  After a checkout, admin orders should show a valid email address (contains @)
try:
    adm_s4 = new_session()
    login(adm_s4, ADMIN_EMAIL, ADMIN_PASSWORD)
    r      = adm_s4.get(url("/api/admin/orders"), timeout=TIMEOUT)
    if r.status_code == 200:
        orders = r.json()
        if orders:
            email_field = orders[0].get("email", "")
            looks_like_email = "@" in email_field and "." in email_field
            test("P5", "Orders table stores email (not display name)",
                 looks_like_email,
                 f"email field = '{email_field}' — fix: store req.session.email in /api/checkout")
        else:
            test("P5", "Orders email field check (no orders yet — skipped)", True, warn=True)
    else:
        test("P5", "Orders email field check", False, f"Got {r.status_code}")
except Exception as e:
    test("P5", "Orders stores email not name", False, str(e), warn=True)


# =============================================================
# PHASE 6-1 — Social Plugin / Share Buttons
# =============================================================
print("\n── Phase 6-1 : Social Plugin / Share Buttons ───────────")

try:
    r = s0.get(url("/"), timeout=TIMEOUT)
    html = r.text

    # 6-01 Facebook sharer link present in homepage
    fb_present = "facebook.com/sharer" in html
    test("P6-1", "Facebook share link present in homepage HTML",
         fb_present,
         "Add <a href='https://www.facebook.com/sharer/sharer.php?u=...'> to footer")

    # 6-03 Share links open in new tab (target="_blank")
    blank_present = 'target="_blank"' in html or "target='_blank'" in html
    test("P6-1", "Share links use target='_blank' (opens new tab)",
         blank_present,
         "Add target='_blank' rel='noopener noreferrer' to share links")

    # 6-04 Share links include rel="noopener noreferrer" (security)
    noopener_present = "noopener" in html
    test("P6-1", "Share links have rel='noopener noreferrer' (security)",
         noopener_present,
         "Add rel='noopener noreferrer' to all target='_blank' links")

    # 6-05 Share links are placed inside <footer>
    footer_start = html.lower().find("<footer")
    footer_end   = html.lower().find("</footer>")
    footer_html  = html[footer_start:footer_end] if footer_start != -1 and footer_end != -1 else ""
    share_in_footer = ("facebook.com/sharer" in footer_html or
                       "twitter.com/intent/tweet" in footer_html or
                       "x.com/intent/tweet" in footer_html)
    test("P6-1", "Share links are placed inside <footer>",
         share_in_footer,
         "Social share links should live inside the <footer> element")

    # 6-06 Share URL contains your actual shop domain (not a placeholder)
    real_domain = BASE_URL.replace("https://", "").replace("http://", "").split("/")[0]
    has_real_domain = (real_domain in html or "ierg4210" in html or "s14" in html)
    test("P6-1", "Share URL contains your actual shop domain",
         has_real_domain,
         f"Replace example.com with your real domain ({real_domain}) in share links")

    # 6-07 No dead Facebook SDK script tag still present
    dead_sdk = ("fb-root" in html or "connect.facebook.net" in html or "xfbml=1" in html)
    test("P6-1", "No dead Facebook SDK script (connect.facebook.net removed)",
         not dead_sdk,
         "Remove the old FB SDK <script> tag — it no longer renders and slows page load")

except Exception as e:
    test("P6-1", "Phase 6-1 social plugin checks", False, str(e))

# =============================================================
# PHASE 6-2 — Pagination / AJAX Product Browsing
# =============================================================
print("\n── Phase 6-2 : Pagination / AJAX Browsing ───────────────")

try:
    # 6-P-01 API returns new paginated format (object with products/total/page/limit)
    r = s0.get(url("/api/products"), timeout=TIMEOUT)
    data = r.json()
    is_paginated_format = (
        isinstance(data, dict) and
        "products" in data and
        "total" in data and
        "page" in data and
        "limit" in data
    )
    test("P6-2", "GET /api/products returns paginated format {products, total, page, limit}",
         is_paginated_format,
         "API should return an object with products[], total, page, limit — not a plain array")

    # 6-P-02 products field is a list
    if is_paginated_format:
        test("P6-2", "products field is an array",
             isinstance(data["products"], list),
             "data.products must be a list/array")

    # 6-P-03 page and limit are integers
    if is_paginated_format:
        test("P6-2", "page and limit are integers in response",
             isinstance(data["page"], int) and isinstance(data["limit"], int),
             "page and limit must be integers")

    # 6-P-04 page param is respected
    r2 = s0.get(url("/api/products?page=1&limit=2"), timeout=TIMEOUT)
    d2 = r2.json()
    test("P6-2", "GET /api/products?page=1&limit=2 returns at most 2 products",
         isinstance(d2, dict) and len(d2.get("products", [])) <= 2,
         "API should honour the limit param and return <= 2 products")

    # 6-P-05 page 2 returns DIFFERENT products from page 1
    r3 = s0.get(url("/api/products?page=2&limit=2"), timeout=TIMEOUT)
    d3 = r3.json()
    if d2.get("products") and d3.get("products"):
        pids_p1 = {p["pid"] for p in d2["products"]}
        pids_p2 = {p["pid"] for p in d3["products"]}
        test("P6-2", "Page 2 returns different products than page 1",
             len(pids_p1 & pids_p2) == 0,
             "Products on page 2 should not overlap with page 1 (check OFFSET logic)")
    else:
        test("P6-2", "Page 2 returns different products than page 1",
             False,
             "Not enough products to test page 2 — add at least 3 products to DB")

    # 6-P-06 total count is consistent across pages
    if is_paginated_format:
        total_p1 = d2.get("total")
        total_p2 = d3.get("total")
        test("P6-2", "total count is consistent across different pages",
             total_p1 is not None and total_p1 == total_p2,
             "total field must return the same value regardless of which page is requested")

    # 6-P-07 catid filter still works with pagination
    r4 = s0.get(url("/api/products?catid=1&page=1&limit=2"), timeout=TIMEOUT)
    d4 = r4.json()
    test("P6-2", "catid filter works combined with pagination",
         isinstance(d4, dict) and "products" in d4,
         "GET /api/products?catid=1&page=1&limit=2 should return paginated format")

    # 6-P-08 all products in filtered result belong to correct category
    if isinstance(d4, dict) and d4.get("products"):
        all_correct_cat = all(p["catid"] == 1 for p in d4["products"])
        test("P6-2", "All products in catid=1 filter belong to category 1",
             all_correct_cat,
             "Filtered products must all have catid matching the filter")

    # 6-P-09 invalid page param is handled gracefully (no crash)
    r5 = s0.get(url("/api/products?page=-1&limit=abc"), timeout=TIMEOUT)
    test("P6-2", "Invalid page/limit params handled gracefully (no 500 error)",
         r5.status_code in (200, 400),
         "Server should not crash on invalid page/limit — return 200 or 400, not 500")

    # 6-P-10 homepage HTML loads without errors (JS pagination wires up)
    r6 = s0.get(url("/"), timeout=TIMEOUT)
    homepage_ok = r6.status_code == 200
    test("P6-2", "Homepage loads successfully (200 OK)",
         homepage_ok,
         "GET / must return 200 for JS pagination to initialise")

    # 6-P-11 ?page= param in homepage URL is not rejected by server
    r7 = s0.get(url("/?page=2"), timeout=TIMEOUT)
    test("P6-2", "Homepage with ?page=2 query param loads successfully",
         r7.status_code == 200,
         "GET /?page=2 must return 200 — server should not reject page param on homepage")

    # 6-P-12 ?catid=+page= combined URL loads homepage successfully
    r8 = s0.get(url("/?catid=1&page=1"), timeout=TIMEOUT)
    test("P6-2", "Homepage with ?catid=1&page=1 loads successfully",
         r8.status_code == 200,
         "GET /?catid=1&page=1 must return 200")

except Exception as e:
    test("P6-2", "Phase 6-2 pagination checks", False, str(e))


# =============================================================
# PHASE 6 — Drag-and-Drop File Upload
# =============================================================
print("\n── Phase 6-3 : Drag-and-Drop ──────────────────────────────")

import os
from io import BytesIO

# 6DD-01  Drop zone element exists in admin HTML
try:
    adm = new_session()
    login(adm, ADMIN_EMAIL, ADMIN_PASSWORD)
    r   = adm.get(url("/admin"), timeout=TIMEOUT)
    html = r.text if r.status_code == 200 else ""
    test("P6", "Admin panel has #drop-zone element",
         'id="drop-zone"' in html,
         "id='drop-zone' not found in admin.html")
except Exception as e:
    test("P6", "Admin panel has #drop-zone element", False, str(e))

# 6DD-02  Preview container exists in admin HTML
try:
    test("P6", "Admin panel has #preview-container element",
         'id="preview-container"' in html,
         "id='preview-container' not found in admin.html")
except Exception as e:
    test("P6", "Admin panel has #preview-container element", False, str(e))

# 6DD-03  Preview image element exists
try:
    test("P6", "Admin panel has #preview-img element",
         'id="preview-img"' in html,
         "id='preview-img' not found in admin.html")
except Exception as e:
    test("P6", "Admin panel has #preview-img element", False, str(e))

# 6DD-04  Drop error element exists (for rejection feedback)
try:
    test("P6", "Admin panel has #drop-error element",
         'id="drop-error"' in html,
         "id='drop-error' not found in admin.html")
except Exception as e:
    test("P6", "Admin panel has #drop-error element", False, str(e))

# 6DD-05  Non-image file upload is rejected by server (MIME validation)
try:
    adm2 = new_session()
    login(adm2, ADMIN_EMAIL, ADMIN_PASSWORD)
    csrf = get_csrf(adm2)
    fake_txt = BytesIO(b"this is not an image")
    r = adm2.post(url("/api/products"),
                  data={"catid": "1", "name": "TestReject",
                        "price": "1.00", "description": "test"},
                  files={"image": ("evil.txt", fake_txt, "text/plain")},
                  headers={"x-csrf-token": csrf},
                  timeout=TIMEOUT)
    test("P6", "Server rejects non-image file upload (400)",
         r.status_code == 400,
         f"Got {r.status_code} — server must validate MIME type")
except Exception as e:
    test("P6", "Server rejects non-image file upload", False, str(e))

# 6DD-06  Valid image file upload is accepted by server
try:
    adm3 = new_session()
    login(adm3, ADMIN_EMAIL, ADMIN_PASSWORD)
    csrf = get_csrf(adm3)
    # Minimal 1x1 red JPEG
    tiny_jpeg = bytes([
        0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,
        0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,
        0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,
        0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
        0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,
        0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,
        0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,
        0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
        0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,
        0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,
        0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,
        0x09,0x0A,0x0B,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,
        0x00,0xF5,0x0A,0xFF,0xD9
    ])
    r = adm3.post(url("/api/products"),
                  data={"catid": "1", "name": "TestImageUpload",
                        "price": "1.00", "description": "test"},
                  files={"image": ("test.jpg", BytesIO(tiny_jpeg), "image/jpeg")},
                  headers={"x-csrf-token": csrf},
                  timeout=TIMEOUT)
    new_test_pid = r.json().get("pid") if r.status_code == 201 else None
    test("P6", "Server accepts valid JPEG image upload (201)",
         r.status_code == 201,
         f"Got {r.status_code}: {r.text[:100]}")

    # Cleanup
    if new_test_pid:
        csrf2 = get_csrf(adm3)
        adm3.delete(url(f"/api/products/{new_test_pid}"),
                    headers={"x-csrf-token": csrf2}, timeout=TIMEOUT)
except Exception as e:
    test("P6", "Server accepts valid image upload", False, str(e))



# =============================================================
# PHASE 6 — Complete Order Management (Item 10)
# =============================================================
print("\n── Phase 6-4 : Complete Order Management ──────────────────")

# 6OM-01  /api/my-orders returns ALL orders (not capped at 5)
try:
    om_s = new_session()
    login(om_s, USER_EMAIL, USER_PASSWORD)
    r    = om_s.get(url("/api/my-orders"), timeout=TIMEOUT)
    data = r.json() if r.status_code == 200 else None
    test("P6", "/api/my-orders returns JSON array (all orders)",
         r.status_code == 200 and isinstance(data, list),
         f"Got {r.status_code}, type={type(data)}")
except Exception as e:
    test("P6", "/api/my-orders returns all orders", False, str(e))


# 6OM-02  /api/my-orders blocked for unauthenticated
try:
    anon_om = new_session()
    r       = anon_om.get(url("/api/my-orders"), timeout=TIMEOUT)
    test("P6", "/api/my-orders blocked for unauthenticated (401/403)",
         r.status_code in {401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P6", "/api/my-orders requires auth", False, str(e))


# 6OM-03  Cancel endpoint exists and blocked for unauthenticated
try:
    anon_cancel = new_session()
    csrf        = get_csrf(anon_cancel)
    r           = anon_cancel.delete(url("/api/orders/1"),
                                     headers={"x-csrf-token": csrf},
                                     timeout=TIMEOUT)
    test("P6", "DELETE /api/orders/:id blocked for unauthenticated (401/403)",
         r.status_code in {401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P6", "Cancel order requires auth", False, str(e))


# 6OM-04  Cancel non-existent order returns 404
try:
    cancel_s = new_session()
    login(cancel_s, USER_EMAIL, USER_PASSWORD)
    csrf = get_csrf(cancel_s)
    r    = cancel_s.delete(url("/api/orders/999999"),
                           headers={"x-csrf-token": csrf},
                           timeout=TIMEOUT)
    test("P6", "Cancel non-existent order returns 404",
         r.status_code == 404,
         f"Got {r.status_code}")
except Exception as e:
    test("P6", "Cancel non-existent order returns 404", False, str(e))


# 6OM-05  Repay endpoint exists and blocked for unauthenticated
try:
    anon_repay = new_session()
    csrf       = get_csrf(anon_repay)
    r          = anon_repay.post(url("/api/orders/1/repay"),
                                 headers={"x-csrf-token": csrf},
                                 timeout=TIMEOUT)
    test("P6", "POST /api/orders/:id/repay blocked for unauthenticated (401/403)",
         r.status_code in {401, 403},
         f"Got {r.status_code}")
except Exception as e:
    test("P6", "Repay order requires auth", False, str(e))


# 6OM-06  Repay non-existent order returns 404
try:
    repay_s = new_session()
    login(repay_s, USER_EMAIL, USER_PASSWORD)
    csrf = get_csrf(repay_s)
    r    = repay_s.post(url("/api/orders/999999/repay"),
                        headers={"x-csrf-token": csrf},
                        timeout=TIMEOUT)
    test("P6", "Repay non-existent order returns 404",
         r.status_code == 404,
         f"Got {r.status_code}")
except Exception as e:
    test("P6", "Repay non-existent order returns 404", False, str(e))


# 6OM-07  Create a pending order then cancel it
new_order_id = None
try:
    # Step 1: create a real pending order via checkout
    co_s = new_session()
    login(co_s, USER_EMAIL, USER_PASSWORD)
    prods = get_products(co_s)
    if prods:
        csrf = get_csrf(co_s)
        r    = co_s.post(url("/api/checkout"),
                         json={"items": [{"pid": prods[0]["pid"], "qty": 1}]},
                         headers={"x-csrf-token": csrf},
                         timeout=TIMEOUT)
        # Get the latest pending order from my-orders
        r2      = co_s.get(url("/api/my-orders"), timeout=TIMEOUT)
        orders  = r2.json() if r2.status_code == 200 else []
        pending = [o for o in orders if o["status"] == "pending"]
        if pending:
            new_order_id = pending[0]["orderid"]
            # Step 2: cancel it
            csrf2 = get_csrf(co_s)
            r3    = co_s.delete(url(f"/api/orders/{new_order_id}"),
                                headers={"x-csrf-token": csrf2},
                                timeout=TIMEOUT)
            test("P6", "User can cancel their own pending order (200)",
                 r3.status_code == 200,
                 f"Got {r3.status_code}: {r3.text[:100]}")

            # Step 3: verify status is now cancelled
            r4     = co_s.get(url("/api/my-orders"), timeout=TIMEOUT)
            orders2 = r4.json() if r4.status_code == 200 else []
            cancelled_order = next(
                (o for o in orders2 if o["orderid"] == new_order_id), None)
            test("P6", "Cancelled order status updated to 'cancelled'",
                 cancelled_order and cancelled_order["status"] == "cancelled",
                 f"Status: {cancelled_order['status'] if cancelled_order else 'not found'}")
        else:
            test("P6", "Cancel pending order (no pending orders — skipped)", True, warn=True)
    else:
        test("P6", "Cancel pending order (no products — skipped)", True, warn=True)
except Exception as e:
    test("P6", "User can cancel pending order", False, str(e))


# 6OM-08  Cannot cancel a paid order
try:
    paid_s  = new_session()
    login(paid_s, ADMIN_EMAIL, ADMIN_PASSWORD)
    r       = paid_s.get(url("/api/admin/orders"), timeout=TIMEOUT)
    orders  = r.json() if r.status_code == 200 else []
    paid    = [o for o in orders if o["status"] == "paid"]
    if paid:
        # Try to cancel as the order owner — use user session
        user_s3 = new_session()
        login(user_s3, USER_EMAIL, USER_PASSWORD)
        csrf = get_csrf(user_s3)
        r2   = user_s3.delete(url(f"/api/orders/{paid[0]['orderid']}"),
                               headers={"x-csrf-token": csrf},
                               timeout=TIMEOUT)
        test("P6", "Cannot cancel a paid order (400/403/404)",
             r2.status_code in {400, 403, 404},
             f"Got {r2.status_code} — paid orders must not be cancellable")
    else:
        test("P6", "Cannot cancel paid order (no paid orders — skipped)", True, warn=True)
except Exception as e:
    test("P6", "Cannot cancel paid order", False, str(e))


# 6OM-09  Cannot cancel another user's order
try:
    # Create order as USER, try to cancel as ADMIN
    owner_s = new_session()
    login(owner_s, USER_EMAIL, USER_PASSWORD)
    r       = owner_s.get(url("/api/my-orders"), timeout=TIMEOUT)
    orders  = r.json() if r.status_code == 200 else []
    pending = [o for o in orders if o["status"] == "pending"]
    if pending:
        csrf  = get_csrf(admin_s)   # admin session from P2B
        r2    = admin_s.delete(url(f"/api/orders/{pending[0]['orderid']}"),
                                headers={"x-csrf-token": csrf},
                                timeout=TIMEOUT)
        test("P6", "Admin cannot cancel another user's order (403/404)",
             r2.status_code in {403, 404},
             f"Got {r2.status_code} — must check userid ownership")
    else:
        test("P6", "Cannot cancel other user's order (no pending — skipped)", True, warn=True)
except Exception as e:
    test("P6", "Cannot cancel other user's order", False, str(e))


# 6OM-10  Repay endpoint returns Stripe URL for pending order
try:
    repay_s2 = new_session()
    login(repay_s2, USER_EMAIL, USER_PASSWORD)
    r        = repay_s2.get(url("/api/my-orders"), timeout=TIMEOUT)
    orders   = r.json() if r.status_code == 200 else []
    pending  = [o for o in orders if o["status"] == "pending"]
    if pending:
        csrf = get_csrf(repay_s2)
        r2   = repay_s2.post(url(f"/api/orders/{pending[0]['orderid']}/repay"),
                              headers={"x-csrf-token": csrf},
                              timeout=TIMEOUT)
        if r2.status_code == 200:
            checkout_url = r2.json().get("url", "")
            test("P6", "Repay pending order returns Stripe URL",
                 "stripe.com" in checkout_url,
                 f"URL: {checkout_url[:80]}")
        else:
            test("P6", "Repay pending order returns Stripe URL",
                 False, f"Got {r2.status_code}: {r2.text[:100]}", warn=True)
    else:
        test("P6", "Repay pending order (no pending orders — skipped)", True, warn=True)
except Exception as e:
    test("P6", "Repay pending order returns Stripe URL", False, str(e), warn=True)

# =============================================================
# FINAL REPORT
# =============================================================
print()
print("═" * 62)
print("  FINAL REPORT")
print("═" * 62)

total_decisive = _passed + _failed
score_pct      = (100 * _passed // total_decisive) if total_decisive else 0

print(f"\n  ✅  Passed   : {_passed}")
print(f"  ❌  Failed   : {_failed}")
print(f"  ⚠️   Warnings : {_warned}")
print(f"  📊  Total    : {_passed + _failed + _warned}")
print(f"  🎯  Score    : {_passed}/{total_decisive}  ({score_pct}%)\n")

if _failed:
    print("── FAILURES ─────────────────────────────────────────────")
    for ph, nm, st, det in _results:
        if st == "FAIL":
            print(f"  ❌ [{ph}] {nm}")
            if det:
                print(f"        → {det}")

if _warned:
    print("\n── WARNINGS ─────────────────────────────────────────────")
    for ph, nm, st, det in _results:
        if st == "WARN":
            print(f"  ⚠️  [{ph}] {nm}")
            if det:
                print(f"        → {det}")

print()
sys.exit(0 if _failed == 0 else 1)
