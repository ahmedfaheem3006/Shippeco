const DAFTRA_BASE = "https://shippec.daftra.com/api2";
const API_KEY = "9990c72eceff847a8e947ceae75f3e00f5777e96";
const ALLOWED_ENDPOINTS = ["/invoices", "/clients"];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // ══════════════════════════════════════════════
      // فاتورة واحدة من DB (للـ Modal)
      // ══════════════════════════════════════════════
      if (path === "/db/invoice" && request.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "?id=XXXXX required" }, 400);
        const row = await env.DB.prepare(
          "SELECT * FROM invoices WHERE id = ? OR daftra_id = ?"
        ).bind(id, id).first();
        if (!row) return jsonResponse({ error: "Not found" }, 404);
        let items = [];
        try { items = typeof row.items === "string" ? JSON.parse(row.items) : (row.items || []); } catch { items = []; }
        return jsonResponse({ ...row, items, needs_enrichment: !row.awb || row.awb === "" });
      }

      // ══════════════════════════════════════════════
      // إثراء فاتورة واحدة من دفترة وحفظها
      // ══════════════════════════════════════════════
      if (path === "/db/invoice/enrich" && (request.method === "POST" || request.method === "GET")) {
        const daftraId = url.searchParams.get("daftra_id");
        if (!daftraId) return jsonResponse({ error: "?daftra_id=XXXXX required" }, 400);
        const res = await fetchDaftra(`${DAFTRA_BASE}/invoices/${daftraId}`);
        if (!res.ok) return jsonResponse({ error: "Daftra returned " + res.status }, res.status);
        const data = await res.json();
        const fullInv = data.data?.Invoice || data.Invoice || {};
        const extracted = extractAllData(fullInv);
        await env.DB.prepare(`
          UPDATE invoices SET awb=?, items=?, sender=?, receiver=?, sender_phone=?, receiver_phone=?,
            sender_address=?, receiver_address=?, receiver_country=?, dimensions=?, final_weight=?, carrier=?, details=?
          WHERE daftra_id=?
        `).bind(
          extracted.awb, JSON.stringify(extracted.items), extracted.sender, extracted.receiver,
          extracted.sender_phone, extracted.receiver_phone, extracted.sender_address, extracted.receiver_address,
          extracted.receiver_country, extracted.dimensions, extracted.final_weight, extracted.carrier || "DHL",
          buildDetails(fullInv, fullInv.no || daftraId, extracted), daftraId
        ).run();
        const updated = await env.DB.prepare("SELECT * FROM invoices WHERE daftra_id = ?").bind(daftraId).first();
        let items = [];
        try { items = typeof updated.items === "string" ? JSON.parse(updated.items) : (updated.items || []); } catch { items = []; }
        return jsonResponse({ ok: true, invoice: { ...updated, items }, extracted });
      }

      // ══════════════════════════════════════════════
      // فواتير أساسية (للجدول - سريع مع pagination)
      // ══════════════════════════════════════════════
      if (path === "/db/invoices/light" && request.method === "GET") {
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const status = url.searchParams.get("status") || "";
        const search = url.searchParams.get("search") || "";
        const offset = (page - 1) * limit;
        let whereClause = "1=1";
        const binds = [];
        if (status && status !== "all") { whereClause += " AND status = ?"; binds.push(status); }
        if (search) {
          whereClause += " AND (client LIKE ? OR phone LIKE ? OR id LIKE ? OR daftra_id LIKE ?)";
          const s = `%${search}%`; binds.push(s, s, s, s);
        }
        const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM invoices WHERE ${whereClause}`).bind(...binds).first();
        const rows = await env.DB.prepare(`
          SELECT id, daftra_id, client, phone, carrier, details, price, partial_paid, status, date, awb
          FROM invoices WHERE ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?
        `).bind(...binds, limit, offset).all();
        return jsonResponse({
          invoices: rows.results.map(row => ({
            ...row, paid: row.partial_paid || 0,
            remaining: (row.price || 0) - (row.partial_paid || 0),
            has_details: row.awb && row.awb !== "",
          })),
          pagination: { page, limit, total: countResult?.total || 0, pages: Math.ceil((countResult?.total || 0) / limit) },
        });
      }

      // ══════════════════════════════════════════════
      // تشخيص
      // ══════════════════════════════════════════════
      if (path === "/debug/invoice") {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "?id=XXXXX required" }, 400);
        const res = await fetchDaftra(`${DAFTRA_BASE}/invoices/${id}`);
        if (!res.ok) return jsonResponse({ error: "Daftra returned " + res.status }, res.status);
        return jsonResponse(await res.json());
      }

      if (path === "/debug/db-invoice") {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "?id=XXXXX required" }, 400);
        const row = await env.DB.prepare("SELECT * FROM invoices WHERE id = ? OR daftra_id = ?").bind(id, id).first();
        if (!row) return jsonResponse({ error: "Not found" }, 404);
        return jsonResponse(row);
      }

      if (path === "/debug/extract") {
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "?id=XXXXX required" }, 400);
        const res = await fetchDaftra(`${DAFTRA_BASE}/invoices/${id}`);
        if (!res.ok) return jsonResponse({ error: "Daftra returned " + res.status }, res.status);
        const data = await res.json();
        const inv = data.data?.Invoice || data.Invoice || {};
        const extracted = extractAllData(inv);
        return jsonResponse({
          daftra_id: inv.id, invoice_no: inv.no,
          client: inv.client_business_name || inv.client_first_name,
          phone: extractPhone(inv), ...extracted,
          raw_custom_fields: inv.InvoiceCustomField || [],
          raw_items_count: (inv.InvoiceItem || []).length,
        });
      }

      // ══════════════════════════════════════════════
      // ══════════════════════════════════════════════
      //           CLIENTS MODULE — NEW
      // ══════════════════════════════════════════════
      // ══════════════════════════════════════════════

      // ─── إنشاء جدول العملاء ───
      if (path === "/db/clients/init" && (request.method === "POST" || request.method === "GET")) {
        try {
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS clients (
              id TEXT PRIMARY KEY,
              daftra_id TEXT,
              name TEXT NOT NULL DEFAULT '',
              phone TEXT DEFAULT '',
              email TEXT DEFAULT '',
              city TEXT DEFAULT '',
              state TEXT DEFAULT '',
              country_code TEXT DEFAULT 'SA',
              address TEXT DEFAULT '',
              category TEXT DEFAULT '',
              notes TEXT DEFAULT '',
              created_at TEXT DEFAULT '',
              total_invoices INTEGER DEFAULT 0,
              total_revenue REAL DEFAULT 0,
              total_paid REAL DEFAULT 0,
              total_remaining REAL DEFAULT 0,
              paid_count INTEGER DEFAULT 0,
              unpaid_count INTEGER DEFAULT 0,
              partial_count INTEGER DEFAULT 0,
              returned_count INTEGER DEFAULT 0,
              last_invoice_date TEXT DEFAULT '',
              last_invoice_id TEXT DEFAULT '',
              avg_invoice REAL DEFAULT 0,
              max_invoice REAL DEFAULT 0,
              first_invoice_date TEXT DEFAULT '',
              segment TEXT DEFAULT 'new',
              collection_rate REAL DEFAULT 0,
              updated_at TEXT DEFAULT ''
            )
          `).run();
          await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)").run();
          await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone)").run();
          await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clients_segment ON clients(segment)").run();
          await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clients_city ON clients(city)").run();
          await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clients_daftra ON clients(daftra_id)").run();
          return jsonResponse({ ok: true, message: "Clients table created with indexes" });
        } catch (e) {
          return jsonResponse({ ok: false, error: e.message }, 500);
        }
      }

            // ─── مزامنة العملاء — خطوة 1: جلب من دفترة فقط ───
      if (path === "/db/clients/sync" && (request.method === "POST" || request.method === "GET")) {
        try {
          const step = url.searchParams.get("step") || "1";
          const maxPages = parseInt(url.searchParams.get("pages") || "5");
          const now = new Date().toISOString();

          // ═══ Step 1: جلب عملاء دفترة وحفظهم (5 صفحات في المرة) ═══
          if (step === "1") {
            const startPage = parseInt(url.searchParams.get("start") || "1");
            let page = startPage;
            const allClients = [];
            const endPage = startPage + maxPages - 1;

            while (page <= endPage) {
              const res = await fetchDaftra(`${DAFTRA_BASE}/clients?page=${page}&limit=50`);
              if (!res.ok) break;
              const raw = await res.json();
              const rows = raw.data || (Array.isArray(raw) ? raw : []);
              if (!rows.length) break;
              allClients.push(...rows);
              const pg = raw.pagination;
              if (!pg || !pg.next || page >= (pg.page_count || 1)) {
                // وصلنا آخر صفحة
                break;
              }
              page++;
            }

            if (!allClients.length) {
              return jsonResponse({ ok: true, step: 1, saved: 0, message: "No more clients to fetch", done: true });
            }

            const insertStmt = env.DB.prepare(`
              INSERT INTO clients (id, daftra_id, name, phone, email, city, state, country_code, address, category, notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, phone=excluded.phone, email=excluded.email,
                city=excluded.city, state=excluded.state, country_code=excluded.country_code,
                address=excluded.address, updated_at=excluded.updated_at
            `);

            const batch = [];
            const seen = new Set();
            for (const row of allClients) {
              const c = row.Client || row;
              const daftraId = String(c.id || "");
              if (!daftraId || seen.has(daftraId)) continue;
              seen.add(daftraId);

              const name = (c.business_name || `${c.first_name || ""} ${c.last_name || ""}`.trim()).trim();
              if (!name) continue;
              const phone = c.phone2 || c.phone1 || c.mobile || "";
              const email = c.email || "";
              const city = c.city || (c.default_address ? c.default_address.city : "") || "";
              const state = c.state || (c.default_address ? c.default_address.state : "") || "";
              const countryCode = c.country_code || "SA";
              const address = [c.address1, c.address2].filter(Boolean).join(", ");

              batch.push(insertStmt.bind(
                "c" + daftraId, daftraId, name, phone, email, city, state, countryCode,
                address, c.category || "", c.notes || "", c.created || "", now
              ));
            }

            for (let i = 0; i < batch.length; i += 50) {
              await env.DB.batch(batch.slice(i, i + 50));
            }

            const hasMore = allClients.length >= maxPages * 50;
            return jsonResponse({
              ok: true, step: 1, saved: batch.length, fetched: allClients.length,
              next_start: page + 1, has_more: hasMore,
              message: hasMore ? `تم حفظ ${batch.length} عميل — أرسل step=1&start=${page + 1} للمزيد` : "تم جلب كل العملاء من دفترة"
            });
          }

          // ═══ Step 2: حساب الإحصائيات من الفواتير ═══
          if (step === "2") {
            const offset = parseInt(url.searchParams.get("offset") || "0");
            const batchSize = 200;

            // ✅ الحساب الصحيح:
            // لو status=paid → المدفوع الحقيقي = price كامل (حتى لو partial_paid = 0)
            // لو status=partial → المدفوع = partial_paid
            // لو status=unpaid/returned → المدفوع = 0
            // المتبقي = فقط من unpaid + partial (مش returned/paid)
            const statsRows = await env.DB.prepare(`
              SELECT
                client as name, phone,
                COUNT(*) as total_invoices,
                COALESCE(SUM(CASE WHEN status != 'returned' THEN price ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(
                  CASE
                    WHEN status = 'paid' THEN price
                    WHEN status = 'partial' THEN COALESCE(partial_paid, 0)
                    ELSE 0
                  END
                ), 0) as total_paid,
                COALESCE(SUM(
                  CASE
                    WHEN status = 'unpaid' THEN price
                    WHEN status = 'partial' THEN price - COALESCE(partial_paid, 0)
                    ELSE 0
                  END
                ), 0) as total_remaining,
                SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN status='unpaid' THEN 1 ELSE 0 END) as unpaid_count,
                SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) as partial_count,
                SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) as returned_count,
                MAX(date) as last_invoice_date,
                MIN(date) as first_invoice_date,
                AVG(CASE WHEN status != 'returned' THEN price ELSE NULL END) as avg_invoice,
                MAX(price) as max_invoice
              FROM invoices
              GROUP BY client
              LIMIT ? OFFSET ?
            `).bind(batchSize, offset).all();

            if (!statsRows.results.length) {
              await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
                .bind("last_clients_sync", JSON.stringify(now), now).run();
              return jsonResponse({ ok: true, step: 2, updated: 0, done: true, message: "كل الإحصائيات محدثة" });
            }

            let updated = 0;
            for (const s of statsRows.results) {
              const name = (s.name || "").trim();
              if (!name) continue;

              const revenue = parseFloat(s.total_revenue) || 0;
              const paid = parseFloat(s.total_paid) || 0;
              const remaining = parseFloat(s.total_remaining) || 0;
              const collectionRate = revenue > 0 ? (paid / revenue) * 100 : 0;

              const daysSinceLast = s.last_invoice_date
                ? Math.floor((Date.now() - new Date(s.last_invoice_date).getTime()) / 86400000)
                : 999;

              let segment = "new";
              if (revenue >= 10000 && collectionRate >= 70) segment = "vip";
              else if (remaining > 0 && collectionRate < 50 && (s.total_invoices || 0) >= 3) segment = "defaulter";
              else if (daysSinceLast <= 30) segment = "active";
              else if (daysSinceLast > 90) segment = "dormant";
              else segment = "regular";

              // حاول تحديث عميل موجود بالاسم
              const existing = await env.DB.prepare("SELECT id FROM clients WHERE name = ? LIMIT 1").bind(name).first();

              if (existing) {
                await env.DB.prepare(`
                  UPDATE clients SET
                    total_invoices=?, total_revenue=?, total_paid=?, total_remaining=?,
                    paid_count=?, unpaid_count=?, partial_count=?, returned_count=?,
                    last_invoice_date=?, first_invoice_date=?, avg_invoice=?, max_invoice=?,
                    segment=?, collection_rate=?, phone=CASE WHEN phone='' OR phone IS NULL THEN ? ELSE phone END, updated_at=?
                  WHERE id=?
                `).bind(
                  s.total_invoices || 0, +revenue.toFixed(2), +paid.toFixed(2), +remaining.toFixed(2),
                  s.paid_count || 0, s.unpaid_count || 0, s.partial_count || 0, s.returned_count || 0,
                  s.last_invoice_date || "", s.first_invoice_date || "",
                  +(parseFloat(s.avg_invoice) || 0).toFixed(2), +(parseFloat(s.max_invoice) || 0).toFixed(2),
                  segment, +collectionRate.toFixed(1), s.phone || "", now, existing.id
                ).run();
              } else {
                // عميل من الفواتير مش موجود في دفترة
                const safeId = "inv_" + name.replace(/[^a-zA-Z0-9\u0600-\u06FF_]/g, "_").slice(0, 60) + "_" + Date.now().toString(36);
                await env.DB.prepare(`
                  INSERT INTO clients (id, daftra_id, name, phone, created_at, updated_at,
                    total_invoices, total_revenue, total_paid, total_remaining,
                    paid_count, unpaid_count, partial_count, returned_count,
                    last_invoice_date, first_invoice_date, avg_invoice, max_invoice,
                    segment, collection_rate)
                  VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    total_invoices=excluded.total_invoices, total_revenue=excluded.total_revenue,
                    total_paid=excluded.total_paid, total_remaining=excluded.total_remaining,
                    paid_count=excluded.paid_count, unpaid_count=excluded.unpaid_count,
                    partial_count=excluded.partial_count, segment=excluded.segment,
                    collection_rate=excluded.collection_rate, updated_at=excluded.updated_at
                `).bind(
                  safeId, name, s.phone || "", now, now,
                  s.total_invoices || 0, +revenue.toFixed(2), +paid.toFixed(2), +remaining.toFixed(2),
                  s.paid_count || 0, s.unpaid_count || 0, s.partial_count || 0, s.returned_count || 0,
                  s.last_invoice_date || "", s.first_invoice_date || "",
                  +(parseFloat(s.avg_invoice) || 0).toFixed(2), +(parseFloat(s.max_invoice) || 0).toFixed(2),
                  segment, +collectionRate.toFixed(1)
                ).run();
              }
              updated++;
            }

            const hasMore = statsRows.results.length >= batchSize;
            return jsonResponse({
              ok: true, step: 2, updated, offset, next_offset: offset + batchSize,
              has_more: hasMore,
              message: hasMore ? `تم تحديث ${updated} — أرسل step=2&offset=${offset + batchSize} للمزيد` : "تم تحديث كل الإحصائيات"
            });
          }

          return jsonResponse({ error: "step must be 1 or 2" }, 400);
        } catch (e) {
          return jsonResponse({ ok: false, error: e.message, stack: e.stack }, 500);
        }
      }

      // ─── إحصائيات العملاء (للجدول) ───
      // ✅ يحسب من الفواتير مباشرة بالمنطق الصحيح — دائماً متطابق مع التفاصيل 100%
      if (path === "/db/clients/stats" && request.method === "GET") {
        try {
          const pg         = parseInt(url.searchParams.get("page")    || "1");
          const lim        = parseInt(url.searchParams.get("limit")   || "50");
          const search     = url.searchParams.get("search")   || "";
          const segFilter  = url.searchParams.get("segment")  || "";
          const cityFilter = url.searchParams.get("city")     || "";
          const sort       = url.searchParams.get("sort")     || "revenue";
          const order      = url.searchParams.get("order")    || "desc";
          const offset     = (pg - 1) * lim;

          // بناء الفلاتر
          const wheres = [];
          const binds  = [];
          if (search) {
            wheres.push("(e.name LIKE ? OR e.phone LIKE ? OR e.email LIKE ? OR e.city LIKE ?)");
            const s = `%${search}%`;
            binds.push(s, s, s, s);
          }
          if (cityFilter && cityFilter !== "all") {
            wheres.push("e.city = ?");
            binds.push(cityFilter);
          }

          // تعبير التصنيف المحسوب
          const segSQL = `CASE
            WHEN e.total_revenue >= 10000
             AND e.total_revenue > 0
             AND (e.total_paid * 100.0 / e.total_revenue) >= 70 THEN 'vip'
            WHEN e.total_remaining > 0
             AND e.total_revenue > 0
             AND (e.total_paid * 100.0 / e.total_revenue) < 50
             AND e.total_invoices >= 3 THEN 'defaulter'
            WHEN julianday('now') - julianday(e.last_invoice_date) <= 30 THEN 'active'
            WHEN julianday('now') - julianday(e.last_invoice_date) >  90 THEN 'dormant'
            ELSE 'regular'
          END`;
          if (segFilter && segFilter !== "all") {
            wheres.push(`(${segSQL}) = ?`);
            binds.push(segFilter);
          }

          const WHERE = wheres.length ? "WHERE " + wheres.join(" AND ") : "";

          const sortMap = {
            revenue:    "e.total_revenue",
            invoices:   "e.total_invoices",
            name:       "e.name",
            remaining:  "e.total_remaining",
            recent:     "e.last_invoice_date",
            paid:       "e.total_paid",
            collection: "(CASE WHEN e.total_revenue>0 THEN e.total_paid*100.0/e.total_revenue ELSE 0 END)"
          };
          const sortExpr = sortMap[sort] || "e.total_revenue";
          const dir      = order === "asc" ? "ASC" : "DESC";

          // CTE: حساب الإحصائيات الصحيحة من الفواتير + بيانات التواصل من clients
          const CTE = `
            WITH inv_stats AS (
              SELECT
                i.client AS name,
                COUNT(*) AS total_invoices,
                ROUND(COALESCE(SUM(CASE WHEN i.status!='returned' THEN i.price ELSE 0 END),0),2) AS total_revenue,
                ROUND(COALESCE(SUM(
                  CASE WHEN i.status='paid'    THEN i.price
                       WHEN i.status='partial' THEN COALESCE(i.partial_paid,0)
                       ELSE 0 END
                ),0),2) AS total_paid,
                ROUND(COALESCE(SUM(
                  CASE WHEN i.status='unpaid'  THEN i.price
                       WHEN i.status='partial' THEN i.price - COALESCE(i.partial_paid,0)
                       ELSE 0 END
                ),0),2) AS total_remaining,
                SUM(CASE WHEN i.status='paid'     THEN 1 ELSE 0 END) AS paid_count,
                SUM(CASE WHEN i.status='unpaid'   THEN 1 ELSE 0 END) AS unpaid_count,
                SUM(CASE WHEN i.status='partial'  THEN 1 ELSE 0 END) AS partial_count,
                SUM(CASE WHEN i.status='returned' THEN 1 ELSE 0 END) AS returned_count,
                MAX(i.date) AS last_invoice_date,
                MIN(i.date) AS first_invoice_date,
                ROUND(COALESCE(AVG(CASE WHEN i.status!='returned' THEN i.price ELSE NULL END),0),2) AS avg_invoice,
                MAX(i.price) AS max_invoice
              FROM invoices i
              WHERE i.client IS NOT NULL AND i.client != ''
              GROUP BY i.client
            ),
            e AS (
              SELECT
                COALESCE(c.id, 'x_'||SUBSTR(s.name,1,40)) AS id,
                COALESCE(c.daftra_id,'')     AS daftra_id,
                s.name,
                COALESCE(c.phone,'')         AS phone,
                COALESCE(c.email,'')         AS email,
                COALESCE(c.city,'')          AS city,
                COALESCE(c.state,'')         AS state,
                COALESCE(c.country_code,'SA') AS country_code,
                COALESCE(c.notes,'')         AS notes,
                COALESCE(c.created_at,'')    AS created_at,
                s.total_invoices, s.total_revenue, s.total_paid, s.total_remaining,
                s.paid_count, s.unpaid_count, s.partial_count, s.returned_count,
                s.last_invoice_date, s.first_invoice_date, s.avg_invoice, s.max_invoice
              FROM inv_stats s
              LEFT JOIN clients c ON c.name = s.name
            )
          `;

          const [countRes, rowsRes] = await Promise.all([
            env.DB.prepare(`${CTE} SELECT COUNT(*) AS total FROM e ${WHERE}`)
              .bind(...binds).first(),
            env.DB.prepare(`
              ${CTE}
              SELECT
                e.*,
                ROUND(CASE WHEN e.total_revenue>0 THEN (e.total_paid*100.0/e.total_revenue) ELSE 0 END,1) AS collection_rate,
                ${segSQL} AS segment,
                '' AS last_invoice_id,
                '' AS updated_at
              FROM e
              ${WHERE}
              ORDER BY ${sortExpr} ${dir}
              LIMIT ? OFFSET ?
            `).bind(...binds, lim, offset).all()
          ]);

          return jsonResponse({
            clients: rowsRes.results,
            pagination: {
              page: pg, limit: lim,
              total: countRes?.total || 0,
              pages: Math.ceil((countRes?.total || 0) / lim)
            }
          });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // ─── ملخص إجمالي (KPI cards + segments + cities + top) ───
      if (path === "/db/clients/summary" && request.method === "GET") {
        try {
          // ✅ UNIFIED SQL — same as /stats CTE
          const totals = await env.DB.prepare(`
            SELECT
              (SELECT COUNT(DISTINCT client) FROM invoices WHERE client != '') as total_clients,
              COUNT(*) as total_invoices,
              COALESCE(SUM(CASE WHEN status != 'returned' THEN price ELSE 0 END), 0) as total_revenue,
              COALESCE(SUM(
                CASE
                  WHEN status = 'paid' THEN price
                  WHEN status = 'partial' THEN COALESCE(partial_paid, 0)
                  ELSE 0
                END
              ), 0) as total_paid,
              COALESCE(SUM(
                CASE
                  WHEN status = 'unpaid' THEN price
                  WHEN status = 'partial' THEN price - COALESCE(partial_paid, 0)
                  ELSE 0
                END
              ), 0) as total_remaining
            FROM invoices
          `).first();

          const totalRevenue = parseFloat(totals?.total_revenue || 0);
          const totalPaid = parseFloat(totals?.total_paid || 0);
          const avgCollectionRate = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;

          const segments = await env.DB.prepare(`
            SELECT segment, COUNT(*) as count FROM clients WHERE total_invoices > 0 GROUP BY segment
          `).all();

          const cities = await env.DB.prepare(`
            SELECT city, COUNT(*) as count FROM clients WHERE city != '' AND total_invoices > 0 GROUP BY city ORDER BY count DESC LIMIT 20
          `).all();

          // ✅ TOP CLIENTS — LIVE from invoices (same SQL logic as /stats CTE)
          const topClients = await env.DB.prepare(`
            SELECT
              i.client as name,
              COALESCE(c.phone, '') as phone,
              COALESCE(c.city, '') as city,
              COUNT(*) as total_invoices,
              ROUND(COALESCE(SUM(CASE WHEN i.status != 'returned' THEN i.price ELSE 0 END), 0), 2) as total_revenue,
              ROUND(COALESCE(SUM(
                CASE WHEN i.status = 'paid' THEN i.price
                    WHEN i.status = 'partial' THEN COALESCE(i.partial_paid, 0)
                    ELSE 0 END
              ), 0), 2) as total_paid,
              ROUND(COALESCE(SUM(
                CASE WHEN i.status = 'unpaid' THEN i.price
                    WHEN i.status = 'partial' THEN i.price - COALESCE(i.partial_paid, 0)
                    ELSE 0 END
              ), 0), 2) as total_remaining,
              ROUND(CASE
                WHEN SUM(CASE WHEN i.status != 'returned' THEN i.price ELSE 0 END) > 0
                THEN SUM(CASE WHEN i.status = 'paid' THEN i.price WHEN i.status = 'partial' THEN COALESCE(i.partial_paid, 0) ELSE 0 END)
                    * 100.0 / SUM(CASE WHEN i.status != 'returned' THEN i.price ELSE 0 END)
                ELSE 0 END, 1) as collection_rate,
              COALESCE(c.segment, 'regular') as segment,
              MAX(i.date) as last_invoice_date
            FROM invoices i
            LEFT JOIN clients c ON c.name = i.client
            WHERE i.client IS NOT NULL AND i.client != ''
            GROUP BY i.client
            ORDER BY total_revenue DESC
            LIMIT 5
          `).all();

          // ✅ RECENT CLIENTS — also LIVE from invoices
          const recentClients = await env.DB.prepare(`
            SELECT
              i.client as name,
              COALESCE(c.phone, '') as phone,
              COALESCE(c.city, '') as city,
              COUNT(*) as total_invoices,
              ROUND(COALESCE(SUM(CASE WHEN i.status != 'returned' THEN i.price ELSE 0 END), 0), 2) as total_revenue,
              COALESCE(c.segment, 'regular') as segment,
              MAX(i.date) as last_invoice_date,
              COALESCE(c.created_at, '') as created_at
            FROM invoices i
            LEFT JOIN clients c ON c.name = i.client
            WHERE i.client IS NOT NULL AND i.client != ''
            GROUP BY i.client
            ORDER BY last_invoice_date DESC
            LIMIT 5
          `).all();

          return jsonResponse({
            totals: {
              clients: totals?.total_clients || 0,
              invoices: totals?.total_invoices || 0,
              revenue: +totalRevenue.toFixed(2),
              paid: +totalPaid.toFixed(2),
              remaining: +(parseFloat(totals?.total_remaining) || 0).toFixed(2),
              collection_rate: +avgCollectionRate.toFixed(1)
            },
            segments: segments.results,
            cities: cities.results,
            top_clients: topClients.results,
            recent_clients: recentClients.results
          });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // ─── بروفايل عميل واحد ───
      if (path === "/db/clients/profile" && request.method === "GET") {
        try {
          const clientId = url.searchParams.get("id") || "";
          const clientName = url.searchParams.get("name") || "";
          if (!clientId && !clientName) return jsonResponse({ error: "?id=X or ?name=X required" }, 400);

          let client = null;
          if (clientId) client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(clientId).first();
          if (!client && clientName) client = await env.DB.prepare("SELECT * FROM clients WHERE name = ?").bind(clientName).first();
          if (!client) return jsonResponse({ error: "Client not found" }, 404);

          const invoices = await env.DB.prepare(`
            SELECT id, daftra_id, client, phone, awb, carrier, price, date, status,
                  partial_paid, dhl_cost, details, sender, receiver, receiver_country, final_weight
            FROM invoices WHERE client = ? ORDER BY date DESC
          `).bind(client.name).all();

          const monthly = await env.DB.prepare(`
            SELECT
              substr(date, 1, 7) as month,
              COUNT(*) as count,
              SUM(CASE WHEN status != 'returned' THEN price ELSE 0 END) as revenue,
              SUM(CASE WHEN status = 'paid' THEN price WHEN status = 'partial' THEN COALESCE(partial_paid, 0) ELSE 0 END) as paid,
              SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
              SUM(CASE WHEN status='unpaid' THEN 1 ELSE 0 END) as unpaid_count,
              SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) as partial_count
            FROM invoices WHERE client = ?
            GROUP BY substr(date, 1, 7) ORDER BY month DESC LIMIT 12
          `).bind(client.name).all();

          const statusBreakdown = await env.DB.prepare(`
            SELECT status, COUNT(*) as count, SUM(price) as total,
              SUM(CASE WHEN status = 'paid' THEN price WHEN status = 'partial' THEN COALESCE(partial_paid, 0) ELSE 0 END) as paid
            FROM invoices WHERE client = ? GROUP BY status
          `).bind(client.name).all();

          // ✅ UNIFIED SQL — same as /stats CTE and /summary top_clients
          const realStats = await env.DB.prepare(`
            SELECT
              COUNT(*) as total_invoices,
              COALESCE(SUM(CASE WHEN status != 'returned' THEN price ELSE 0 END), 0) as total_revenue,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN price WHEN status = 'partial' THEN COALESCE(partial_paid, 0) ELSE 0 END), 0) as total_paid,
              COALESCE(SUM(CASE WHEN status = 'unpaid' THEN price WHEN status = 'partial' THEN price - COALESCE(partial_paid, 0) ELSE 0 END), 0) as total_remaining,
              SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paid_count,
              SUM(CASE WHEN status='unpaid' THEN 1 ELSE 0 END) as unpaid_count,
              SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) as partial_count,
              SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) as returned_count,
              MAX(date) as last_invoice_date,
              MIN(date) as first_invoice_date,
              AVG(CASE WHEN status != 'returned' THEN price ELSE NULL END) as avg_invoice
            FROM invoices WHERE client = ?
          `).bind(client.name).first();

          const realRevenue = parseFloat(realStats?.total_revenue || 0);
          const realPaidAmt = parseFloat(realStats?.total_paid || 0);
          const realRemainingAmt = parseFloat(realStats?.total_remaining || 0);
          const realCollectionRate = realRevenue > 0 ? (realPaidAmt / realRevenue) * 100 : 0;

          const enrichedClient = {
            ...client,
            total_invoices: realStats?.total_invoices || 0,
            total_revenue: +realRevenue.toFixed(2),
            total_paid: +realPaidAmt.toFixed(2),
            total_remaining: +realRemainingAmt.toFixed(2),
            collection_rate: +realCollectionRate.toFixed(1),
            paid_count: realStats?.paid_count || 0,
            unpaid_count: realStats?.unpaid_count || 0,
            partial_count: realStats?.partial_count || 0,
            returned_count: realStats?.returned_count || 0,
            last_invoice_date: realStats?.last_invoice_date || client.last_invoice_date,
            first_invoice_date: realStats?.first_invoice_date || client.first_invoice_date,
            avg_invoice: +(parseFloat(realStats?.avg_invoice || 0)).toFixed(2),
          };

          return jsonResponse({
            client: enrichedClient,
            invoices: invoices.results,
            monthly: monthly.results,
            status_breakdown: statusBreakdown.results,
            invoice_count: invoices.results.length
          });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // ─── تحديث بيانات عميل ───
      if (path === "/db/clients/update" && request.method === "POST") {
        try {
          const data = await request.json();
          const { id, notes, category, city, phone, email } = data;
          if (!id) return jsonResponse({ error: "id required" }, 400);
          await env.DB.prepare(`
            UPDATE clients SET
              notes = COALESCE(?, notes), category = COALESCE(?, category),
              city = COALESCE(?, city), phone = COALESCE(?, phone),
              email = COALESCE(?, email), updated_at = ?
            WHERE id = ?
          `).bind(notes || null, category || null, city || null, phone || null, email || null, new Date().toISOString(), id).run();
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // ─── قائمة المدن ───
      if (path === "/db/clients/cities" && request.method === "GET") {
        const rows = await env.DB.prepare(`
          SELECT city, COUNT(*) as count FROM clients
          WHERE city != '' AND city IS NOT NULL AND total_invoices > 0
          GROUP BY city ORDER BY count DESC
        `).all();
        return jsonResponse(rows.results);
      }

      // ─── إحصائيات التصنيفات ───
      if (path === "/db/clients/segments" && request.method === "GET") {
        const rows = await env.DB.prepare(`
          SELECT segment, COUNT(*) as count,
            COALESCE(SUM(total_revenue), 0) as revenue,
            COALESCE(SUM(total_remaining), 0) as remaining,
            COALESCE(AVG(collection_rate), 0) as avg_collection
          FROM clients WHERE total_invoices > 0 GROUP BY segment
        `).all();
        return jsonResponse(rows.results);
      }

      // ─── إعادة حساب إحصائيات العملاء (SQL واحد — بدون N+1 queries) ───
      if (path === "/db/clients/recalculate" && (request.method === "POST" || request.method === "GET")) {
        try {
          const now = new Date().toISOString();
          // ✅ UPDATE FROM: جملة SQL واحدة تحدث كل العملاء دفعة واحدة — لا حلقات، لا timeout
          const result = await env.DB.prepare(`
            UPDATE clients
            SET
              total_invoices    = s.total_invoices,
              total_revenue     = s.total_revenue,
              total_paid        = s.total_paid,
              total_remaining   = s.total_remaining,
              paid_count        = s.paid_count,
              unpaid_count      = s.unpaid_count,
              partial_count     = s.partial_count,
              returned_count    = s.returned_count,
              last_invoice_date  = s.last_invoice_date,
              first_invoice_date = s.first_invoice_date,
              avg_invoice       = s.avg_invoice,
              max_invoice       = s.max_invoice,
              collection_rate   = s.collection_rate,
              segment           = s.segment,
              updated_at        = ?
            FROM (
              SELECT
                client AS name,
                COUNT(*) AS total_invoices,
                ROUND(COALESCE(SUM(CASE WHEN status!='returned' THEN price ELSE 0 END),0),2) AS total_revenue,
                ROUND(COALESCE(SUM(CASE WHEN status='paid'    THEN price
                                        WHEN status='partial' THEN COALESCE(partial_paid,0)
                                        ELSE 0 END),0),2) AS total_paid,
                ROUND(COALESCE(SUM(CASE WHEN status='unpaid'  THEN price
                                        WHEN status='partial' THEN price-COALESCE(partial_paid,0)
                                        ELSE 0 END),0),2) AS total_remaining,
                SUM(CASE WHEN status='paid'     THEN 1 ELSE 0 END) AS paid_count,
                SUM(CASE WHEN status='unpaid'   THEN 1 ELSE 0 END) AS unpaid_count,
                SUM(CASE WHEN status='partial'  THEN 1 ELSE 0 END) AS partial_count,
                SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) AS returned_count,
                MAX(date) AS last_invoice_date,
                MIN(date) AS first_invoice_date,
                ROUND(COALESCE(AVG(CASE WHEN status!='returned' THEN price ELSE NULL END),0),2) AS avg_invoice,
                MAX(price) AS max_invoice,
                ROUND(CASE
                  WHEN SUM(CASE WHEN status!='returned' THEN price ELSE 0 END) > 0
                  THEN SUM(CASE WHEN status='paid' THEN price WHEN status='partial' THEN COALESCE(partial_paid,0) ELSE 0 END)
                       * 100.0 / SUM(CASE WHEN status!='returned' THEN price ELSE 0 END)
                  ELSE 0 END, 1) AS collection_rate,
                CASE
                  WHEN SUM(CASE WHEN status!='returned' THEN price ELSE 0 END) >= 10000
                   AND SUM(CASE WHEN status!='returned' THEN price ELSE 0 END) > 0
                   AND SUM(CASE WHEN status='paid' THEN price WHEN status='partial' THEN COALESCE(partial_paid,0) ELSE 0 END)
                       * 100.0 / SUM(CASE WHEN status!='returned' THEN price ELSE 0 END) >= 70 THEN 'vip'
                  WHEN SUM(CASE WHEN status='unpaid' THEN price WHEN status='partial' THEN price-COALESCE(partial_paid,0) ELSE 0 END) > 0
                   AND SUM(CASE WHEN status!='returned' THEN price ELSE 0 END) > 0
                   AND SUM(CASE WHEN status='paid' THEN price WHEN status='partial' THEN COALESCE(partial_paid,0) ELSE 0 END)
                       * 100.0 / SUM(CASE WHEN status!='returned' THEN price ELSE 0 END) < 50
                   AND COUNT(*) >= 3 THEN 'defaulter'
                  WHEN julianday('now') - julianday(MAX(date)) <= 30 THEN 'active'
                  WHEN julianday('now') - julianday(MAX(date)) >  90 THEN 'dormant'
                  ELSE 'regular'
                END AS segment
              FROM invoices
              WHERE client IS NOT NULL AND client != ''
              GROUP BY client
            ) AS s
            WHERE clients.name = s.name
          `).bind(now).run();

          return jsonResponse({
            ok: true,
            updated: result.meta?.changes || 0,
            done: true, has_more: false, next_offset: 0,
            message: `تم إعادة حساب إحصائيات جميع العملاء دفعة واحدة (${result.meta?.changes || 0} عميل)`
          });
        } catch (e) {
          return jsonResponse({ ok: false, error: e.message, stack: e.stack }, 500);
        }
      }



      // ══════════════════════════════════════════════
      //          END CLIENTS MODULE
      // ══════════════════════════════════════════════

      // ══════════════════════════════════════════════
      // مزامنة شاملة
      // ══════════════════════════════════════════════
      if (path === "/db/sync-all" && (request.method === "POST" || request.method === "GET")) {
        try {
          const maxPages = parseInt(url.searchParams.get("pages") || "20");
          const withDetails = url.searchParams.get("details") === "true";
          const statusMap = { "0": "unpaid", "1": "partial", "2": "paid", "3": "returned" };
          const [r0, r1, r2, r3] = await Promise.all([
            fetchAllDaftraInvoices("0", maxPages), fetchAllDaftraInvoices("1", maxPages),
            fetchAllDaftraInvoices("2", maxPages), fetchAllDaftraInvoices("3", maxPages),
          ]);
          const allResults = [
            ...r0.map(r => ({ ...r, _status: "0" })), ...r1.map(r => ({ ...r, _status: "1" })),
            ...r2.map(r => ({ ...r, _status: "2" })), ...r3.map(r => ({ ...r, _status: "3" })),
          ];
          const seen2 = new Set(); let synced = 0, skipped = 0, detailsFetched = 0;
          const uniqueInvoices = [];
          for (const row of allResults) {
            const inv = row.Invoice || row; const daftraId = String(inv.id || "");
            if (!daftraId || seen2.has(daftraId)) { skipped++; continue; }
            seen2.add(daftraId); uniqueInvoices.push({ inv, _status: row._status, daftraId });
          }
          const stmtFast = env.DB.prepare(`
            INSERT INTO invoices (id, daftra_id, client, phone, awb, carrier, price, date, status, payment, details, code_type, created_at, partial_paid, dhl_cost, items, sender, receiver, sender_phone, receiver_phone, sender_address, receiver_address, receiver_country, dimensions, final_weight)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET client=excluded.client, phone=excluded.phone, price=excluded.price, date=excluded.date, status=excluded.status, payment=excluded.payment, partial_paid=excluded.partial_paid, details=excluded.details
          `);
          const fastBatch = [];
          for (const { inv, _status, daftraId } of uniqueInvoices) {
            const statusMap2 = { "0": "unpaid", "1": "partial", "2": "paid", "3": "returned" };
            fastBatch.push(stmtFast.bind(
              "d" + daftraId, daftraId, inv.client_business_name || inv.client_first_name || "", extractPhone(inv),
              "", "DHL", parseFloat(inv.summary_total || inv.grand_total || inv.total || 0), inv.date || "",
              statusMap2[_status] || "unpaid", inv.payment_method || "", `دفترة #${inv.no || inv.number || daftraId}`, "barcode",
              inv.created || new Date().toISOString(), parseFloat(inv.summary_paid || 0), 0, "[]",
              "", "", "", "", "", "", "", "", ""
            )); synced++;
          }
          for (let i = 0; i < fastBatch.length; i += 100) { await env.DB.batch(fastBatch.slice(i, i + 100)); }
          if (withDetails) { detailsFetched = await fetchAndUpdateDetails(env, uniqueInvoices, statusMap); }
          await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
            .bind("last_sync", JSON.stringify(new Date().toISOString()), new Date().toISOString()).run();
          return jsonResponse({
            ok: true, synced, skipped, details_fetched: detailsFetched, total_from_daftra: allResults.length,
            breakdown: { unpaid: r0.length, partial: r1.length, paid: r2.length, returned: r3.length },
            synced_at: new Date().toISOString(),
            tip: !withDetails ? "أضف ?details=true لجلب AWB والمرسل/المستلم (أبطأ)" : undefined,
          });
        } catch (e) { return jsonResponse({ ok: false, error: e.message, stack: e.stack }, 500); }
      }

      // ══════════════════════════════════════════════
      // إثراء فواتير ناقصة
      // ══════════════════════════════════════════════
      if (path === "/db/enrich" && (request.method === "POST" || request.method === "GET")) {
        try {
          const limit = parseInt(url.searchParams.get("limit") || "20");
          const missing = await env.DB.prepare(`
            SELECT daftra_id FROM invoices WHERE daftra_id IS NOT NULL AND daftra_id != '' AND (awb IS NULL OR awb = '') ORDER BY created_at DESC LIMIT ?
          `).bind(limit).all();
          if (!missing.results.length) return jsonResponse({ ok: true, enriched: 0, message: "All invoices already have details" });
          let enriched = 0; const BATCH_SIZE = 5;
          for (let i = 0; i < missing.results.length; i += BATCH_SIZE) {
            const chunk = missing.results.slice(i, i + BATCH_SIZE);
            await Promise.all(chunk.map(async (row) => {
              try {
                const detailRes = await fetchDaftra(`${DAFTRA_BASE}/invoices/${row.daftra_id}`);
                if (!detailRes.ok) return;
                const detailData = await detailRes.json();
                const fullInv = detailData.data?.Invoice || detailData.Invoice || {};
                const extracted = extractAllData(fullInv);
                await env.DB.prepare(`
                  UPDATE invoices SET awb=?, items=?, sender=?, receiver=?, sender_phone=?, receiver_phone=?,
                    sender_address=?, receiver_address=?, receiver_country=?, dimensions=?, final_weight=?, carrier=?, details=?
                  WHERE daftra_id=?
                `).bind(
                  extracted.awb, JSON.stringify(extracted.items), extracted.sender, extracted.receiver,
                  extracted.sender_phone, extracted.receiver_phone, extracted.sender_address, extracted.receiver_address,
                  extracted.receiver_country, extracted.dimensions, extracted.final_weight, extracted.carrier || "DHL",
                  buildDetails(fullInv, fullInv.no || row.daftra_id, extracted), row.daftra_id
                ).run(); enriched++;
              } catch (e) { /* skip */ }
            }));
            if (i + BATCH_SIZE < missing.results.length) await new Promise(r => setTimeout(r, 200));
          }
          return jsonResponse({ ok: true, enriched, checked: missing.results.length });
        } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500); }
      }

      // ══════════════════════════════════════════════
      // مزامنة سريعة
      // ══════════════════════════════════════════════
      if (path === "/db/sync-recent" && (request.method === "POST" || request.method === "GET")) {
        try {
          const statusMap = { "0": "unpaid", "1": "partial", "2": "paid", "3": "returned" };
          const [r0, r1, r2, r3] = await Promise.all([
            fetchAllDaftraInvoices("0", 2), fetchAllDaftraInvoices("1", 2),
            fetchAllDaftraInvoices("2", 2), fetchAllDaftraInvoices("3", 2),
          ]);
          const allResults = [
            ...r0.map(r => ({ ...r, _status: "0" })), ...r1.map(r => ({ ...r, _status: "1" })),
            ...r2.map(r => ({ ...r, _status: "2" })), ...r3.map(r => ({ ...r, _status: "3" })),
          ];
          const seen3 = new Set(); let synced = 0;
          const stmt = env.DB.prepare(`
            INSERT INTO invoices (id, daftra_id, client, phone, awb, carrier, price, date, status, payment, details, code_type, created_at, partial_paid, dhl_cost, items, sender, receiver, sender_phone, receiver_phone, sender_address, receiver_address, receiver_country, dimensions, final_weight)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET client=excluded.client, phone=excluded.phone, price=excluded.price, date=excluded.date, status=excluded.status, payment=excluded.payment, partial_paid=excluded.partial_paid
          `);
          const batch = [];
          for (const row of allResults) {
            const inv = row.Invoice || row; const daftraId = String(inv.id || "");
            if (!daftraId || seen3.has(daftraId)) continue; seen3.add(daftraId);
            batch.push(stmt.bind(
              "d" + daftraId, daftraId, inv.client_business_name || inv.client_first_name || "", extractPhone(inv),
              "", "DHL", parseFloat(inv.summary_total || inv.grand_total || inv.total || 0), inv.date || "",
              statusMap[row._status] || "unpaid", inv.payment_method || "", `دفترة #${inv.no || inv.number || daftraId}`, "barcode",
              inv.created || new Date().toISOString(), parseFloat(inv.summary_paid || 0), 0, "[]",
              "", "", "", "", "", "", "", "", ""
            )); synced++;
          }
          if (batch.length > 0) { for (let i = 0; i < batch.length; i += 100) { await env.DB.batch(batch.slice(i, i + 100)); } }
          await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
            .bind("last_sync_recent", JSON.stringify(new Date().toISOString()), new Date().toISOString()).run();
          return jsonResponse({ ok: true, synced, total_checked: allResults.length, type: "recent" });
        } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500); }
      }

      // ══════════════════════════════════════════════
      // حالة المزامنة
      // ══════════════════════════════════════════════
      if (path === "/db/sync-status") {
        const lastSync = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_sync'").first();
        const lastRecent = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_sync_recent'").first();
        const lastCron = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_cron_sync'").first();
        const countResult = await env.DB.prepare("SELECT COUNT(*) as count FROM invoices").first();
        const statusCounts = await env.DB.prepare(`SELECT status, COUNT(*) as count, SUM(price) as total, SUM(partial_paid) as paid FROM invoices GROUP BY status`).all();
        const awbStats = await env.DB.prepare(`SELECT COUNT(CASE WHEN awb != '' AND awb IS NOT NULL THEN 1 END) as with_awb, COUNT(CASE WHEN awb = '' OR awb IS NULL THEN 1 END) as without_awb FROM invoices`).first();
        return jsonResponse({
          last_full_sync: lastSync ? JSON.parse(lastSync.value) : null,
          last_recent_sync: lastRecent ? JSON.parse(lastRecent.value) : null,
          last_cron_sync: lastCron ? JSON.parse(lastCron.value) : null,
          total_invoices: countResult?.count || 0, awb_stats: awbStats, by_status: statusCounts.results,
        });
      }

      // ══════════════════════════════════════════════
      // ملخص شهري
      // ══════════════════════════════════════════════
      if (path === "/summary") {
        const month = url.searchParams.get("month") || new Date().toISOString().substring(0, 7);
        const [y, m] = month.split("-");
        const dateFrom = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        const dateTo = `${y}-${m}-${lastDay}`;
        const [r0, r1, r2, r3] = await Promise.all([
          fetchDaftraPages("/invoices", { payment_status: "0", date_from: dateFrom, date_to: dateTo }),
          fetchDaftraPages("/invoices", { payment_status: "1", date_from: dateFrom, date_to: dateTo }),
          fetchDaftraPages("/invoices", { payment_status: "2", date_from: dateFrom, date_to: dateTo }),
          fetchDaftraPages("/invoices", { payment_status: "3", date_from: dateFrom, date_to: dateTo }),
        ]);
        const calc = (rows) => {
          let count = 0, total = 0, paidAmt = 0;
          rows.forEach(row => { const inv = row.Invoice || row; count++; total += parseFloat(inv.grand_total || inv.summary_total || inv.total || 0); paidAmt += parseFloat(inv.summary_paid || inv.paid_amount || 0); });
          return { count, total: +total.toFixed(2), paid_amount: +paidAmt.toFixed(2) };
        };
        const unpaid = calc(r0), partial = calc(r1), paid = calc(r2), ret = calc(r3);
        return jsonResponse({
          month, date_from: dateFrom, date_to: dateTo, paid, unpaid, partial, returned: ret,
          total: { count: unpaid.count + partial.count + paid.count + ret.count, total: +(unpaid.total + partial.total + paid.total + ret.total).toFixed(2) },
          collected: +(paid.total + partial.paid_amount).toFixed(2), uncollected: +(unpaid.total + (partial.total - partial.paid_amount)).toFixed(2)
        });
      }

      if (path === "/summary/all") {
        const [r0, r1, r2, r3] = await Promise.all([
          fetchDaftraPages("/invoices", { payment_status: "0" }), fetchDaftraPages("/invoices", { payment_status: "1" }),
          fetchDaftraPages("/invoices", { payment_status: "2" }), fetchDaftraPages("/invoices", { payment_status: "3" }),
        ]);
        const calc = (rows) => { let count = 0, total = 0, paidAmt = 0; rows.forEach(row => { const inv = row.Invoice || row; count++; total += parseFloat(inv.grand_total || inv.summary_total || inv.total || 0); paidAmt += parseFloat(inv.summary_paid || inv.paid_amount || 0); }); return { count, total: +total.toFixed(2), paid_amount: +paidAmt.toFixed(2) }; };
        const unpaid = calc(r0), partial = calc(r1), paid = calc(r2), ret = calc(r3);
        return jsonResponse({
          period: "all", paid, unpaid, partial, returned: ret,
          total: { count: unpaid.count + partial.count + paid.count + ret.count, total: +(unpaid.total + partial.total + paid.total + ret.total).toFixed(2) },
          collected: +(paid.total + partial.paid_amount).toFixed(2), uncollected: +(unpaid.total + (partial.total - partial.paid_amount)).toFixed(2)
        });
      }

      // ══════════════════════════════════════════════
      // Legacy sync
      // ══════════════════════════════════════════════
      if (path === "/db/sync-from-daftra" && (request.method === "POST" || request.method === "GET")) {
        try {
          const syncStatus = url.searchParams.get("status") || "1";
          const maxPages = parseInt(url.searchParams.get("pages") || "5");
          const statusMap = { "0": "unpaid", "1": "partial", "2": "paid", "3": "returned" };
          const all = await fetchAllDaftraInvoices(syncStatus, maxPages);
          const seen4 = new Set(); let synced = 0;
          const stmt = env.DB.prepare(`INSERT OR REPLACE INTO invoices (id, daftra_id, client, phone, awb, carrier, price, date, status, payment, details, code_type, created_at, partial_paid, dhl_cost, items, sender, receiver, sender_phone, receiver_phone, sender_address, receiver_address, receiver_country, dimensions, final_weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
          const batch = [];
          for (const row of all) {
            const inv = row.Invoice || row; const daftraId = String(inv.id || "");
            if (!daftraId || seen4.has(daftraId)) continue; seen4.add(daftraId);
            batch.push(stmt.bind("d" + daftraId, daftraId, inv.client_business_name || inv.client_first_name || "", extractPhone(inv), "", "DHL", parseFloat(inv.summary_total || inv.grand_total || 0), inv.date || "", statusMap[syncStatus] || "unpaid", inv.payment_method || "", `دفترة #${inv.no || daftraId}`, "barcode", inv.created || new Date().toISOString(), parseFloat(inv.summary_paid || 0), 0, "[]", "", "", "", "", "", "", "", "", ""));
            synced++;
          }
          if (batch.length > 0) { for (let i = 0; i < batch.length; i += 100) { await env.DB.batch(batch.slice(i, i + 100)); } }
          return jsonResponse({ ok: true, synced, status: syncStatus, total_from_daftra: all.length });
        } catch (e) { return jsonResponse({ ok: false, error: e.message }, 500); }
      }

      // ══════════════════════════════════════════════
      // Partial clients
      // ══════════════════════════════════════════════
      if (path === "/db/partial-clients") {
        const rows = await env.DB.prepare(`SELECT client, COUNT(*) as count, SUM(price) as total_amount, SUM(partial_paid) as paid_amount, SUM(price - partial_paid) as remaining_amount FROM invoices WHERE status = 'partial' GROUP BY client ORDER BY remaining_amount DESC LIMIT 20`).all();
        return jsonResponse(rows.results);
      }

      // ══════════════════════════════════════════════
      // DB CRUD
      // ══════════════════════════════════════════════
      if (path === "/db/invoices" && request.method === "GET") {
        const rows = await env.DB.prepare("SELECT * FROM invoices ORDER BY date DESC").all();
        return jsonResponse(rows.results);
      }

      if (path === "/db/invoices" && request.method === "POST") {
        const inv = await request.json();
        await env.DB.prepare(`
          INSERT OR REPLACE INTO invoices (id, daftra_id, client, phone, awb, carrier, price, date, status, payment, details, code_type, created_at, partial_paid, dhl_cost, items, sender, receiver, sender_phone, receiver_phone, sender_address, receiver_address, receiver_country, dimensions, final_weight)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          inv.id, inv.daftra_id || null, inv.client, inv.phone || "", inv.awb || "",
          inv.carrier || "DHL", inv.price || 0, inv.date, inv.status || "unpaid",
          inv.payment || "", inv.details || "", inv.codeType || inv.code_type || "barcode",
          inv.created_at || new Date().toISOString(), inv.partial_paid || inv.partialPaid || 0,
          inv.dhl_cost || inv.dhlCost || 0,
          typeof inv.items === 'string' ? inv.items : JSON.stringify(inv.items || []),
          inv.sender || inv.shipperName || "", inv.receiver || inv.receiverName || "",
          inv.sender_phone || inv.shipperPhone || "", inv.receiver_phone || inv.receiverPhone || "",
          inv.sender_address || inv.shipperAddress || "", inv.receiver_address || inv.receiverAddress || "",
          inv.receiver_country || inv.receiverCountry || "", inv.dimensions || "", inv.final_weight || ""
        ).run();
        return jsonResponse({ ok: true });
      }

      if (path === "/db/invoices/clear" && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM invoices").run();
        return jsonResponse({ ok: true, message: "All invoices deleted" });
      }

      if (path === "/db/invoices/bulk" && request.method === "POST") {
        const invs = await request.json();
        const stmt = env.DB.prepare(`INSERT OR REPLACE INTO invoices (id, daftra_id, client, phone, awb, carrier, price, date, status, payment, details, code_type, created_at, partial_paid, dhl_cost, items, sender, receiver, sender_phone, receiver_phone, sender_address, receiver_address, receiver_country, dimensions, final_weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (let i = 0; i < invs.length; i += 100) {
          const chunk = invs.slice(i, i + 100);
          await env.DB.batch(chunk.map(inv => stmt.bind(
            inv.id, inv.daftra_id || null, inv.client, inv.phone || "", inv.awb || "",
            inv.carrier || "DHL", inv.price || 0, inv.date, inv.status || "unpaid",
            inv.payment || "", inv.details || "", inv.codeType || "barcode",
            inv.created_at || new Date().toISOString(), inv.partial_paid || inv.partialPaid || 0,
            inv.dhl_cost || inv.dhlCost || 0, typeof inv.items === 'string' ? inv.items : JSON.stringify(inv.items || []),
            inv.sender || "", inv.receiver || "", inv.sender_phone || "", inv.receiver_phone || "",
            inv.sender_address || "", inv.receiver_address || "", inv.receiver_country || "",
            inv.dimensions || "", inv.final_weight || ""
          )));
        }
        return jsonResponse({ ok: true, count: invs.length });
      }

      if (path.startsWith("/db/invoices/") && request.method === "PUT") {
        const id = path.split("/")[3];
        const inv = await request.json();
        await env.DB.prepare(`
          UPDATE invoices SET status=?, price=?, client=?, phone=?, awb=?, details=?, partial_paid=?, dhl_cost=?, carrier=?, sender=?, receiver=?, sender_phone=?, receiver_phone=?, sender_address=?, receiver_address=?, receiver_country=?, dimensions=?, final_weight=? WHERE id=?
        `).bind(
          inv.status, inv.price, inv.client, inv.phone || "", inv.awb || "",
          inv.details || "", inv.partial_paid || inv.partialPaid || 0,
          inv.dhl_cost || inv.dhlCost || 0, inv.carrier || "",
          inv.sender || "", inv.receiver || "", inv.sender_phone || "",
          inv.receiver_phone || "", inv.sender_address || "", inv.receiver_address || "",
          inv.receiver_country || "", inv.dimensions || "", inv.final_weight || "", id
        ).run();
        return jsonResponse({ ok: true });
      }

      if (path.startsWith("/db/invoices/") && request.method === "DELETE") {
        const id = path.split("/")[3];
        await env.DB.prepare("DELETE FROM invoices WHERE id=?").bind(id).run();
        return jsonResponse({ ok: true });
      }

      // ══════════════════════════════════════════════
      // Settings
      // ══════════════════════════════════════════════
      if (path === "/db/settings" && request.method === "GET") {
        const rows = await env.DB.prepare("SELECT * FROM settings").all();
        const obj = {};
        rows.results.forEach(r => { try { obj[r.key] = JSON.parse(r.value); } catch { obj[r.key] = r.value; } });
        return jsonResponse(obj);
      }

      if (path === "/db/settings" && request.method === "POST") {
        const data = await request.json();
        const stmts = Object.entries(data).map(([k, v]) =>
          env.DB.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,?)").bind(k, JSON.stringify(v), new Date().toISOString())
        );
        await env.DB.batch(stmts);
        return jsonResponse({ ok: true });
      }

      // ══════════════════════════════════════════════
      // Daftra Proxy
      // ══════════════════════════════════════════════
      const allowed = ALLOWED_ENDPOINTS.some((e) => path.startsWith(e));
      if (!allowed) return jsonResponse({ error: "Endpoint not allowed" }, 403);
      if (path === "/invoices") {
        const params = new URLSearchParams(url.search);
        if (params.has("payment_status")) {
          const res = await fetchDaftra(`${DAFTRA_BASE}${path}${url.search}`);
          return jsonResponse(await res.json(), res.status);
        }
        const baseParams = Object.fromEntries(new URLSearchParams(url.search));
        const [r0, r1, r2, r3] = await Promise.all([
          fetchDaftraPages(path, { ...baseParams, payment_status: "0" }), fetchDaftraPages(path, { ...baseParams, payment_status: "1" }),
          fetchDaftraPages(path, { ...baseParams, payment_status: "2" }), fetchDaftraPages(path, { ...baseParams, payment_status: "3" }),
        ]);
        const seen5 = new Set(), all = [];
        for (const inv of [...r0, ...r1, ...r2, ...r3]) {
          const id = String((inv.Invoice || inv).id || "");
          if (!id || seen5.has(id)) continue; seen5.add(id); all.push(inv);
        }
        return jsonResponse({ result: "successful", code: 200, data: all, pagination: { total_results: all.length, page_count: 1, page: 1 } });
      }
      const daftraRes = await fetchDaftra(`${DAFTRA_BASE}${path}${url.search}`, request.method, request.body);
      return jsonResponse(await daftraRes.json(), daftraRes.status);

    } catch (error) {
      return jsonResponse({ error: error.message, stack: error.stack }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    try {
      const statusMap = { "0": "unpaid", "1": "partial", "2": "paid", "3": "returned" };
      const [r0, r1, r2, r3] = await Promise.all([
        fetchAllDaftraInvoices("0", 20), fetchAllDaftraInvoices("1", 20),
        fetchAllDaftraInvoices("2", 20), fetchAllDaftraInvoices("3", 20),
      ]);
      const allResults = [
        ...r0.map(r => ({ ...r, _status: "0" })), ...r1.map(r => ({ ...r, _status: "1" })),
        ...r2.map(r => ({ ...r, _status: "2" })), ...r3.map(r => ({ ...r, _status: "3" })),
      ];
      const seen6 = new Set(); let synced = 0;
      const stmt = env.DB.prepare(`INSERT INTO invoices (id, daftra_id, client, phone, awb, carrier, price, date, status, payment, details, code_type, created_at, partial_paid, dhl_cost, items, sender, receiver, sender_phone, receiver_phone, sender_address, receiver_address, receiver_country, dimensions, final_weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET client=excluded.client, phone=excluded.phone, price=excluded.price, date=excluded.date, status=excluded.status, partial_paid=excluded.partial_paid`);
      const batch = [];
      for (const row of allResults) {
        const inv = row.Invoice || row; const daftraId = String(inv.id || "");
        if (!daftraId || seen6.has(daftraId)) continue; seen6.add(daftraId);
        batch.push(stmt.bind("d" + daftraId, daftraId, inv.client_business_name || inv.client_first_name || "", extractPhone(inv), "", "DHL", parseFloat(inv.summary_total || inv.grand_total || inv.total || 0), inv.date || "", statusMap[row._status] || "unpaid", inv.payment_method || "", `دفترة #${inv.no || daftraId}`, "barcode", inv.created || new Date().toISOString(), parseFloat(inv.summary_paid || 0), 0, "[]", "", "", "", "", "", "", "", "", ""));
        synced++;
      }
      if (batch.length > 0) { for (let i = 0; i < batch.length; i += 100) { await env.DB.batch(batch.slice(i, i + 100)); } }
      const missing = await env.DB.prepare(`SELECT daftra_id FROM invoices WHERE daftra_id IS NOT NULL AND daftra_id != '' AND (awb IS NULL OR awb = '') LIMIT 10`).all();
      let enriched = 0;
      for (const row of missing.results) {
        try {
          const res = await fetchDaftra(`${DAFTRA_BASE}/invoices/${row.daftra_id}`);
          if (!res.ok) continue;
          const data = await res.json(); const fullInv = data.data?.Invoice || data.Invoice || {}; const ext = extractAllData(fullInv);
                    await env.DB.prepare(`UPDATE invoices SET awb=?, items=?, sender=?, receiver=?, sender_phone=?, receiver_phone=?, sender_address=?, receiver_address=?, receiver_country=?, dimensions=?, final_weight=?, carrier=?, details=? WHERE daftra_id=?`).bind(ext.awb, JSON.stringify(ext.items), ext.sender, ext.receiver, ext.sender_phone, ext.receiver_phone, ext.sender_address, ext.receiver_address, ext.receiver_country, ext.dimensions, ext.final_weight, ext.carrier || "DHL", buildDetails(fullInv, fullInv.no || row.daftra_id, ext), row.daftra_id).run();
          enriched++;
        } catch (e) { /* skip */ }
      }
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)").bind("last_cron_sync", JSON.stringify({ synced, enriched, at: new Date().toISOString() }), new Date().toISOString()).run();
      console.log(`[CRON] Synced ${synced}, enriched ${enriched}`);
    } catch (e) { console.error(`[CRON] Failed: ${e.message}`); }
  }
};

// ══════════════════════════════════════════════
// Helper Functions
// ══════════════════════════════════════════════
async function fetchAndUpdateDetails(env, uniqueInvoices, statusMap) {
  let detailsFetched = 0; const BATCH_SIZE = 5;
  for (let i = 0; i < uniqueInvoices.length; i += BATCH_SIZE) {
    const chunk = uniqueInvoices.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async ({ inv, _status, daftraId }) => {
      try {
        const res = await fetchDaftra(`${DAFTRA_BASE}/invoices/${daftraId}`);
        if (!res.ok) return; const data = await res.json();
        const fullInv = data.data?.Invoice || data.Invoice || {}; const ext = extractAllData(fullInv);
        await env.DB.prepare(`UPDATE invoices SET awb=?, items=?, sender=?, receiver=?, sender_phone=?, receiver_phone=?, sender_address=?, receiver_address=?, receiver_country=?, dimensions=?, final_weight=?, carrier=?, details=? WHERE daftra_id=?`).bind(
          ext.awb, JSON.stringify(ext.items), ext.sender, ext.receiver, ext.sender_phone, ext.receiver_phone,
          ext.sender_address, ext.receiver_address, ext.receiver_country, ext.dimensions, ext.final_weight,
          ext.carrier || "DHL", buildDetails(fullInv, fullInv.no || daftraId, ext), daftraId
        ).run(); detailsFetched++;
      } catch (e) { /* skip */ }
    }));
    if (i + BATCH_SIZE < uniqueInvoices.length) await new Promise(r => setTimeout(r, 200));
  }
  return detailsFetched;
}

async function fetchDaftra(url, method = "GET", body = null) {
  return fetch(url, { method, headers: { "Content-Type": "application/json", "APIKEY": API_KEY }, body: ["GET", "HEAD"].includes(method) ? null : body });
}

async function fetchDaftraPages(path, params = {}) {
  let page = 1, all = [];
  while (true) {
    const res = await fetchDaftra(`${DAFTRA_BASE}${path}?${new URLSearchParams({ ...params, page: String(page), limit: "50" })}`);
    if (!res.ok) break; const raw = await res.json();
    const rows = raw.data || (Array.isArray(raw) ? raw : []); if (!rows.length) break;
    all = all.concat(rows); const pg = raw.pagination;
    if (!pg || !pg.next || page >= (pg.page_count || 1)) break; page++;
  }
  return all;
}

async function fetchAllDaftraInvoices(paymentStatus, maxPages = 20) {
  let page = 1, all = [];
  while (page <= maxPages) {
    const res = await fetchDaftra(`${DAFTRA_BASE}/invoices?${new URLSearchParams({ payment_status: paymentStatus, page: String(page), limit: "50" })}`);
    if (!res.ok) break; const raw = await res.json();
    const rows = raw.data || (Array.isArray(raw) ? raw : []); if (!rows.length) break;
    all = all.concat(rows); const pg = raw.pagination;
    if (!pg || !pg.next || page >= (pg.page_count || 1)) break; page++;
  }
  return all;
}

function extractPhone(inv) {
  if (inv.Client) return inv.Client.phone2 || inv.Client.phone1 || inv.Client.mobile || "";
  return inv.client_phone || inv.phone || "";
}

function extractAllData(inv) {
  const result = { awb: "", sender: "", receiver: "", sender_phone: "", receiver_phone: "", sender_address: "", receiver_address: "", receiver_country: "", dimensions: "", final_weight: "", carrier: "DHL", items: [] };
  if (inv.InvoiceCustomField && Array.isArray(inv.InvoiceCustomField)) {
    for (const cf of inv.InvoiceCustomField) {
      const label = (cf.label || "").toLowerCase(); const value = cf.value || cf["real-value"] || "";
      if ((label.includes("بوليصة") || label.includes("awb") || label.includes("tracking")) && value.trim()) { result.awb = value.trim(); break; }
    }
    if (!result.awb) { for (const cf of inv.InvoiceCustomField) { const value = String(cf.value || cf["real-value"] || ""); if (/^\d{8,14}$/.test(value.trim())) { result.awb = value.trim(); break; } } }
  }
  if (inv.InvoiceItem && Array.isArray(inv.InvoiceItem)) {
    for (const it of inv.InvoiceItem) {
      const itemName = it.item || it.product_name || "بند"; const desc = it.description || "";
      result.items.push({ type: itemName, details: desc, price: parseFloat(it.subtotal || it.total || it.unit_price || 0) });
      if (desc) {
        const senderBlock = desc.match(/المرسل[:\s]*\r?\n([\s\S]*?)(?=المستلم|$)/);
        if (senderBlock && !result.sender) {
          const lines = senderBlock[1].trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) result.sender = lines[0];
          for (const line of lines) { const phoneMatch = line.match(/(\+?\d[\d\s\-]{7,})/); if (phoneMatch && !result.sender_phone) { result.sender_phone = phoneMatch[1].replace(/\s/g, ''); break; } }
          const addrLines = lines.slice(1).filter(l => !l.match(/(\+?\d[\d\s\-]{7,})/));
          if (addrLines.length > 0) result.sender_address = addrLines.join(', ');
        }
        const receiverBlock = desc.match(/المستلم[:\s]*\r?\n([\s\S]*?)(?=الوزن|رقم بوليصة|$)/);
        if (receiverBlock && !result.receiver) {
          const lines = receiverBlock[1].trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) result.receiver = lines[0];
          for (const line of lines) { const phoneMatch = line.match(/(\+?\d[\d\s\-]{7,})/); if (phoneMatch && !result.receiver_phone) { result.receiver_phone = phoneMatch[1].replace(/\s/g, ''); break; } }
          const countryLine = lines.find(l => /saudi|emirates|bahrain|kuwait|qatar|oman|egypt|jordan|iraq|usa|america|kingdom/i.test(l));
          if (countryLine) result.receiver_country = countryLine;
          const addrLines = lines.slice(1).filter(l => !l.match(/(\+?\d[\d\s\-]{7,})/) && !l.match(/saudi|america|emirates/i));
          if (addrLines.length > 0) result.receiver_address = addrLines.join(', ');
        }
        const weightBlock = desc.match(/الوزن(?:\s*والأبعاد)?[:\s]*\r?\n([\s\S]*?)(?=الوزن النهائي|رقم بوليصة|$)/);
        if (weightBlock) { const wLines = weightBlock[1].trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (wLines.length > 0) result.dimensions = wLines.join(' | '); }
        const finalWeightMatch = desc.match(/الوزن النهائي[:\s]*([^\r\n]+)/);
        if (finalWeightMatch) result.final_weight = finalWeightMatch[1].trim();
        if (!result.awb) { const awbMatch = desc.match(/(?:بوليصة|رقم بوليصة)[^:]*[:\s]*(\d{8,14})/); if (awbMatch) result.awb = awbMatch[1]; }
        if (!result.awb) { const numMatch = desc.match(/\b(\d{10,14})\b/); if (numMatch) result.awb = numMatch[1]; }
      }
    }
  }
  if (!result.awb) { const notes = inv.notes || inv.staff_notes || ""; const m = notes.match(/\b(\d{10,14})\b/); if (m) result.awb = m[1]; }
  const allText = result.items.map(i => `${i.type} ${i.details}`).join(" ").toLowerCase();
  if (allText.includes("aramex") || allText.includes("أرامكس")) result.carrier = "Aramex";
  else if (allText.includes("smsa")) result.carrier = "SMSA";
  else if (allText.includes("fedex")) result.carrier = "FedEx";
  else if (allText.includes("ups")) result.carrier = "UPS";
  return result;
}

function buildDetails(inv, invoiceNo, extracted = null) {
  const parts = [`دفترة #${invoiceNo}`];
  if (extracted) {
    if (extracted.sender) parts.push(`المرسل: ${extracted.sender}`);
    if (extracted.receiver) parts.push(`المستلم: ${extracted.receiver}`);
    if (extracted.final_weight) parts.push(`الوزن: ${extracted.final_weight}`);
    if (extracted.dimensions) parts.push(`الأبعاد: ${extracted.dimensions}`);
  }
  if (inv.notes) parts.push(inv.notes);
  return parts.join(" | ").slice(0, 500);
}