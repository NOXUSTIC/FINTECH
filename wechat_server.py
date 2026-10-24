"""WeChat Official Account bridge for the finance assistant. stdlib only (plus node for facts.js).
  Server:  WECHAT_TOKEN=... WECHAT_APPID=... WECHAT_SECRET=... python3 wechat_server.py
  Try it without WeChat:  python3 wechat_server.py --cli
Commands change the user's budget; any other text is a question. Replies are English only."""
import calendar, hashlib, json, os, re, sqlite3, subprocess, sys, threading, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pricing
from gen_data import INSTR

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = os.environ.get("WECHAT_TOKEN", ""); APPID = os.environ.get("WECHAT_APPID", ""); SECRET = os.environ.get("WECHAT_SECRET", "")
LLM = os.environ.get("LLM_URL", "http://localhost:8000/v1").rstrip("/"); MODEL = os.environ.get("LLM_MODEL", "finance-llm")
NODE = os.environ.get("NODE_BIN", "node"); DBFILE = os.environ.get("WECHAT_DB", os.path.join(HERE, "wechat_users.db"))
PORT = int(os.environ.get("PORT", "8080"))
SYMS = {"usd": "$", "eur": "€", "gbp": "£", "bdt": "৳", "inr": "₹", "jpy": "¥", "cny": "¥"}
CATS = ["Housing", "Utilities", "Groceries", "Transport", "Health", "Dining", "Shopping", "Entertainment", "Subscriptions", "Other"]
FREQS = ["weekly", "monthly", "quarterly", "yearly"]
BUY_RE = r"\b(buy|purchase|afford|worth it|should i get|price of)\b"
CURS = "৳$€£₹¥"
HELP = ("Set up (English):\n income 4000\n currency BDT\n bill Rent 1300 monthly Housing\n spent 25 Dining coffee\n"
        "Then ask: where can I save? / am I on track? / explain my spending / should I buy an iPhone?\n"
        "Other: summary, undo, reset, help")

def db():
    c = sqlite3.connect(DBFILE, timeout=10)
    c.executescript("""CREATE TABLE IF NOT EXISTS users(openid TEXT PRIMARY KEY, cur TEXT DEFAULT '$', income REAL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS bills(id INTEGER PRIMARY KEY AUTOINCREMENT, openid TEXT, name TEXT, amount REAL, frequency TEXT, due_day INTEGER, category TEXT);
    CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY AUTOINCREMENT, openid TEXT, date TEXT, name TEXT, category TEXT, amount REAL);""")
    return c

def clean(x): return int(x) if float(x).is_integer() else x

def base_of(oid):
    c = db(); c.execute("INSERT OR IGNORE INTO users(openid) VALUES(?)", (oid,))
    cur, inc = c.execute("SELECT cur, income FROM users WHERE openid=?", (oid,)).fetchone()
    t = time.localtime(); ym = time.strftime("%Y-%m", t)
    bills = [dict(name=n, amount=clean(a), frequency=f, due_day=d, category=k) for n, a, f, d, k in c.execute("SELECT name, amount, frequency, due_day, category FROM bills WHERE openid=?", (oid,))]
    exps = [dict(date=d, name=n, category=k, amount=clean(a)) for d, n, k, a in c.execute("SELECT date, name, category, amount FROM expenses WHERE openid=? AND date LIKE ? ORDER BY id", (oid, ym + "%"))]
    c.commit(); c.close()
    return dict(currency=cur, income=clean(inc), day=t.tm_mday, dim=calendar.monthrange(t.tm_year, t.tm_mon)[1], bills=bills, expenses=exps)

def node(payload):
    r = subprocess.run([NODE, os.path.join(HERE, "facts_cli.js")], input=json.dumps(payload), capture_output=True, text=True, timeout=20, check=True)
    return json.loads(r.stdout)

def num(tok):
    try: return float(tok.replace(",", ""))
    except ValueError: return None

def cat_of(tok):
    return next((c for c in CATS if c.lower() == tok.lower()), None)

def quick_reply(oid, text):
    """Instant replies for setup commands. Returns None when the text is a question."""
    w = text.strip().split()
    if not w: return HELP
    cmd = w[0].lower(); c = db(); c.execute("INSERT OR IGNORE INTO users(openid) VALUES(?)", (oid,))
    sym = c.execute("SELECT cur FROM users WHERE openid=?", (oid,)).fetchone()[0]
    fm = lambda n: sym + format(round(n), ",")
    try:
        if cmd in ("help", "hi", "hello", "menu", "start"): return HELP
        if cmd == "income" and len(w) == 2 and num(w[1]) is not None and num(w[1]) >= 0:
            c.execute("UPDATE users SET income=? WHERE openid=?", (num(w[1]), oid)); return "Income set to %s a month." % fm(num(w[1]))
        if cmd == "currency" and len(w) == 2:
            if w[1].lower() not in SYMS: return "Supported currencies: " + ", ".join(k.upper() for k in SYMS)
            c.execute("UPDATE users SET cur=? WHERE openid=?", (SYMS[w[1].lower()], oid)); return "Currency set to %s." % SYMS[w[1].lower()]
        if cmd == "bill":
            toks = w[1:]; i = next((k for k, t in enumerate(toks) if num(t) is not None), None)
            if i is None or i == 0: return "Use: bill NAME AMOUNT [weekly|monthly|quarterly|yearly] [category] [due day]. Example: bill Rent 1300 monthly Housing"
            name, amt, freq, cat, day = " ".join(toks[:i]), num(toks[i]), "monthly", "Other", 1
            for t in toks[i + 1:]:
                if t.lower() in FREQS: freq = t.lower()
                elif cat_of(t): cat = cat_of(t)
                elif num(t) is not None and 1 <= num(t) <= 31: day = int(num(t))
            c.execute("INSERT INTO bills(openid,name,amount,frequency,due_day,category) VALUES(?,?,?,?,?,?)", (oid, name, amt, freq.capitalize(), day, cat))
            return "Added bill %s: %s %s (%s, due day %d)." % (name, fm(amt), freq, cat, day)
        if cmd in ("spent", "spend", "expense") and len(w) >= 2 and num(w[1]) is not None:
            cat = cat_of(w[2]) if len(w) > 2 else None; note = " ".join(w[3:] if cat else w[2:]) or (cat or "Other")
            cat = cat or "Other"
            c.execute("INSERT INTO expenses(openid,date,name,category,amount) VALUES(?,?,?,?,?)", (oid, time.strftime("%Y-%m-%d"), note, cat, num(w[1])))
            return "Added expense: %s on %s (%s)." % (fm(num(w[1])), note, cat)
        if cmd == "undo":
            row = c.execute("SELECT id, amount, name FROM expenses WHERE openid=? ORDER BY id DESC LIMIT 1", (oid,)).fetchone()
            if not row: return "No expenses to undo."
            c.execute("DELETE FROM expenses WHERE id=?", (row[0],)); return "Removed: %s on %s." % (fm(row[1]), row[2])
        if cmd == "reset":
            if len(w) == 2 and w[1].lower() == "yes":
                for t in ("bills", "expenses"): c.execute("DELETE FROM %s WHERE openid=?" % t, (oid,))
                c.execute("UPDATE users SET income=0 WHERE openid=?", (oid,)); return "All your data was deleted."
            return "This deletes all your data. Send 'reset yes' to confirm."
        if cmd in ("summary", "show"):
            c.commit(); c.close(); c = None
            F = node({"mode": "facts", "base": base_of(oid)})
            if F["no_income"]: return "No income yet. Send: income 4000"
            return "Income %s. Spent %s plus %s in bills. Left to save %s (%s%% of income). Health score %s/100." % (F["income"], F["spent_so_far"], F["bills_per_month"], F["left_to_save"], F["savings_rate_pct"], F["health_score"])
        return None
    finally:
        if c is not None: c.commit(); c.close()

def ok_answer(x, F):
    if re.search("([" + CURS + r"])\1", x): return False
    if F["meets_20pct_goal"] and re.search(r"you need|guide needs", x, re.I): return False
    if not F["meets_20pct_goal"] and re.search(r"already meet|which meets", x, re.I): return False
    vals = " ".join(str(v) for v in F.values())
    ok = {"20", "35", "30", "50", "100"} | {n.rstrip(",") for n in re.findall(r"\d[\d,]*", vals)}
    if any(n.rstrip(",") not in ok for n in re.findall(r"\d[\d,]*", x)): return False
    return all(a.rstrip(",") in vals for a in re.findall("[" + CURS + r"]\d[\d,]*", x))

def fallback(F):
    if F["no_income"]: return "Add your monthly income first (send: income 4000), then ask again."
    return ("Here is what the budget rules show: you have spent %s plus %s in bills, %s is left to save (%s%% of income, goal 20%%), and your health score is %s out of 100."
            % (F["spent_so_far"], F["bills_per_month"], F["left_to_save"], F["savings_rate_pct"], F["health_score"]))

def emergency(F):
    if F["no_income"] or F["nothing_entered"]: return "Add your income, bills and expenses first (send help) so I can work out your emergency fund target."
    mo = F["months_to_emergency_fund"]
    L = ["An emergency fund covers about three months of spending.", "Your target is %s." % F["emergency_fund_target"],
         ("At %s saved per month that takes about %s month%s." % (F["left_to_save"], mo, "" if mo == "1" else "s")) if mo != "n/a" else "You are not saving anything yet, so start by setting aside even a small amount each month.",
         "Build it with an automatic transfer on payday into a separate savings account, and use it only for real emergencies."]
    return "\n".join(L)

def model_reply(base, F, text):
    ctx = {"facts": F, "bills": base["bills"], "expenses_this_month": base["expenses"][-20:]}
    prompt = INSTR + "\n\n<finance_data>" + json.dumps(ctx, ensure_ascii=False, separators=(",", ":")) + "</finance_data>\n\nQuestion: " + text
    try:
        req = urllib.request.Request(LLM + "/chat/completions", headers={"Content-Type": "application/json"},
              data=json.dumps({"model": MODEL, "messages": [{"role": "user", "content": prompt}], "max_tokens": 400, "temperature": 0}).encode())
        out = json.load(urllib.request.urlopen(req, timeout=60))["choices"][0]["message"]["content"].strip()
    except Exception:
        return "The assistant is offline right now. Try again in a moment."
    return out if ok_answer(out, F) else fallback(F)

def purchase_reply(base, text):
    j = pricing.lookup(text, base["currency"])
    if j.get("error") == "unknown_product": return "I do not have a price source for that yet. Products I can check: " + (", ".join(j["known"]) or "none") + "."
    if j.get("error") == "no_sources": return "No store URLs are set for %s yet. Add one to products.json." % j["product"]
    if j.get("error") in ("no_results", "no_sources"): return j["message"] + ((" (" + "; ".join("%s: %s" % (e["store"], e["reason"]) for e in j["errors"]) + ")") if j["errors"] else "")
    if not j.get("best"): return "I could not read a price for %s. %s." % (j["product"], "; ".join("%s: %s" % (e["store"], e["reason"]) for e in j["errors"]))
    h = j.get("history", {})
    out = node({"mode": "purchase", "base": base, "offer": {"name": j["product"], "store": j["best"]["store"], "stores": len(j["offers"]), "converted": j["best"]["converted"],
                "price": j["best"]["price_user"], "lowest_before": h.get("lowest_before"), "n_before": h.get("n_before", 0)}})
    others = ", ".join("%s %s%s" % (o["store"], base["currency"], format(round(o["price_user"]), ",")) for o in j["offers"] if o is not j["best"])
    return out["text"] + ("\nOther stores: %s." % others if others else "") + "\nSource: " + j["best"]["url"] + ("\n" + j["note"] if j.get("note") else "")

def slow_reply(oid, text):
    base = base_of(oid)
    if re.search(BUY_RE, text, re.I): return purchase_reply(base, text)
    F = node({"mode": "facts", "base": base})
    if re.search(r"emergency|rainy.?day|safety net", text, re.I): return emergency(F)
    return model_reply(base, F, text)

# ---------------- WeChat plumbing ----------------
def verify(q):
    try: sig, ts, nonce = q["signature"][0], q["timestamp"][0], q["nonce"][0]
    except (KeyError, IndexError): return False
    return bool(TOKEN) and hashlib.sha1("".join(sorted([TOKEN, ts, nonce])).encode()).hexdigest() == sig

def clip(s, n=1800):
    b = s.encode(); return s if len(b) <= n else b[:n].decode("utf-8", "ignore") + "..."

def cdata(s): return "<![CDATA[" + s.replace("]]>", "]]]]><![CDATA[>") + "]]>"

def passive(to, frm, text):
    return "<xml><ToUserName>%s</ToUserName><FromUserName>%s</FromUserName><CreateTime>%d</CreateTime><MsgType>%s</MsgType><Content>%s</Content></xml>" % (cdata(to), cdata(frm), time.time(), cdata("text"), cdata(clip(text)))

_tok = {"v": None, "exp": 0}
def access_token(force=False):
    if not force and _tok["v"] and time.time() < _tok["exp"]: return _tok["v"]
    j = json.load(urllib.request.urlopen("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=%s&secret=%s" % (APPID, SECRET), timeout=10))
    if "access_token" not in j: raise RuntimeError(j)
    _tok.update(v=j["access_token"], exp=time.time() + j.get("expires_in", 7200) - 300); return _tok["v"]

def send_custom(oid, text, retry=True):
    body = json.dumps({"touser": oid, "msgtype": "text", "text": {"content": clip(text)}}, ensure_ascii=False).encode()
    req = urllib.request.Request("https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=" + access_token(), data=body, headers={"Content-Type": "application/json"})
    j = json.load(urllib.request.urlopen(req, timeout=10))
    if j.get("errcode") in (40001, 42001) and retry: access_token(True); return send_custom(oid, text, False)
    if j.get("errcode"): print("WeChat send failed:", j, flush=True)

def answer_async(oid, text):
    try: r = slow_reply(oid, text)
    except Exception as e: print("error:", repr(e), flush=True); r = "Sorry, something went wrong. Try again."
    try: send_custom(oid, r)
    except Exception as e: print("send error:", repr(e), flush=True)

seen = {}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="text/plain; charset=utf-8"):
        data = body.encode(); self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        pu = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(pu.query)
        if pu.path == "/health": return self._send(200, "ok")
        if pu.path == "/wechat" and verify(q): return self._send(200, q.get("echostr", [""])[0])
        self._send(403, "forbidden")
    def do_POST(self):
        pu = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(pu.query)
        if pu.path != "/wechat" or not verify(q): return self._send(403, "forbidden")
        raw = self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 65536))
        try: m = ET.fromstring(raw)
        except ET.ParseError: return self._send(400, "bad xml")
        get = lambda k: m.findtext(k) or ""
        oid, me, kind = get("FromUserName"), get("ToUserName"), get("MsgType")
        mid = get("MsgId") or oid + get("CreateTime")
        if mid in seen: return self._send(200, "success")
        if len(seen) > 2000: seen.clear()
        seen[mid] = time.time()
        if kind == "event" and get("Event") == "subscribe": return self._send(200, passive(oid, me, "Welcome! " + HELP), "application/xml")
        if kind != "text": return self._send(200, "success")
        text = get("Content"); r = quick_reply(oid, text)
        if r is not None: return self._send(200, passive(oid, me, r), "application/xml")
        threading.Thread(target=answer_async, args=(oid, text), daemon=True).start()
        self._send(200, "success")   # WeChat allows 5 seconds; the real answer is pushed afterwards

def cli():
    print("Finance assistant console. Type help. Ctrl+C to quit.")
    while True:
        try: t = input("> ")
        except (EOFError, KeyboardInterrupt): print(); break
        r = quick_reply("cli-user", t)
        print(r if r is not None else slow_reply("cli-user", t))

if __name__ == "__main__":
    if "--cli" in sys.argv: cli()
    else:
        if not (TOKEN and APPID and SECRET): print("Warning: set WECHAT_TOKEN, WECHAT_APPID and WECHAT_SECRET.", flush=True)
        print("WeChat bridge on port %d (callback path /wechat, health check /health)" % PORT, flush=True)
        ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
