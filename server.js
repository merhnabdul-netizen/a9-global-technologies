require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pg = require("pg");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it in your hosting provider's environment settings.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
const q = (sql, params = []) => pool.query(sql, params);

const defaultServices = [
["CAC registration","Registration","Business registration support and guidance."],
["NAFDAC registration","Registration","Registration assistance and documentation guidance."],
["TIN registration","Registration","Tax identification number registration assistance."],
["School registration","Registration","School registration support."],
["Trademark registration","Registration","Trademark registration support."],
["NECO Nov/Dec registration","Registration","Support for NECO November/December registration."],
["Newspaper publication","Registration","Publication for names and loss of documents."],
["Website design","System Development","Professional business website design."],
["Application development","System Development","Custom application planning and development."],
["Flight booking","Travel","Flight booking assistance."],
["Hotel reservation","Travel","Hotel reservation assistance."],
["Tour packages","Travel","Tour package planning and booking assistance."],
["Visa application assistance","Travel","Visa application documentation support."],
["Hajj and Umrah","Travel","Hajj and Umrah planning and assistance."],
["Company branding package","Company Package","Logo, business cards, letterhead, envelopes, seal and stamp."],
["Printing and graphic design","Printing & Design","Banners, books, memos, certificates, calendars, flyers, bags, mugs and more."],
["Software installation","Computer Services","Computer software installation and setup."],
["Computer literacy training","Computer Services","Practical computer skills training."],
["Computer and accessories","Computer Services","Enquire about computers and accessories."]
];
const courses = [
"Certificate in Computer Operation and Management",
"Certificate in Microsoft Offices (Word, Excel, PowerPoint and office apps)",
"Certificate in Basics of Cyber Security"
];

async function initDb() {
  await q(`CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS services (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS products (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Computers', description TEXT NOT NULL DEFAULT '', price DOUBLE PRECISION NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, image_url TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS requests (id BIGSERIAL PRIMARY KEY, ref TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL REFERENCES users(id), service_name TEXT NOT NULL, details TEXT NOT NULL, contact_method TEXT NOT NULL DEFAULT 'Office visit', status TEXT NOT NULL DEFAULT 'Received', admin_note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY, ref TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL REFERENCES users(id), product_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, unit_price DOUBLE PRECISION NOT NULL, fulfilment TEXT NOT NULL DEFAULT 'Collect at office', delivery_address TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Received', payment_status TEXT NOT NULL DEFAULT 'Unpaid', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS applications (id BIGSERIAL PRIMARY KEY, ref TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL REFERENCES users(id), course_name TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending', admin_note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const count = await q("SELECT COUNT(*)::int AS n FROM services");
  if (count.rows[0].n === 0) for (const s of defaultServices) await q("INSERT INTO services(name,category,description) VALUES($1,$2,$3)", s);
  for (const c of courses) await q("INSERT INTO settings(key,value) VALUES($1,'open') ON CONFLICT(key) DO NOTHING", ["course:" + c]);
  await q("INSERT INTO settings(key,value) VALUES('training_open','yes') ON CONFLICT(key) DO NOTHING");
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const existing = await q("SELECT id,role FROM users WHERE email=$1", [email]);
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
    if (!existing.rows.length) await q("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin')", ["Website Owner", email, hash]);
    else if (existing.rows[0].role === "admin") await q("UPDATE users SET password_hash=$1 WHERE id=$2", [hash, existing.rows[0].id]);
  }
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "unsafe-development-secret-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(__dirname, "public")));
function requireAuth(req,res,next) { if (!req.session.user) return res.status(401).json({ error: "Please sign in first." }); next(); }
function requireAdmin(req,res,next) { if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "Owner access only." }); next(); }
function clean(v, max=2000) { return String(v ?? "").trim().slice(0,max); }
function ref(prefix) { return prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2,6).toUpperCase(); }
function userPublic(u) { return { id:u.id, name:u.name, email:u.email, role:u.role }; }
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(err => { console.error(err); if (!res.headersSent) res.status(500).json({error:"Something went wrong. Please try again."}); });

app.get("/health", (req,res) => res.json({ok:true}));
app.get("/api/config", asyncRoute(async (req,res) => {
 const setting = await q("SELECT value FROM settings WHERE key='training_open'");
 res.json({ company: { name:"A9 Global Technologies", tagline:"Customer Satisfaction Is Our No. 1 Priority", email:"service.a9globaltechltd@gmail.com", phone:"07069362725", address:"No. 5 Zaria Road, opposite Rabiu Wise, Funtua, Katsina State" }, user:req.session.user||null, trainingOpen:setting.rows[0]?.value !== "no" });
}));
app.get("/api/services", asyncRoute(async (req,res) => res.json((await q("SELECT * FROM services WHERE active=1 ORDER BY category,name")).rows)));
app.get("/api/products", asyncRoute(async (req,res) => res.json((await q("SELECT * FROM products WHERE active=1 ORDER BY id DESC")).rows)));
app.get("/api/courses", asyncRoute(async (req,res) => {
 const rows = (await q("SELECT key,value FROM settings WHERE key LIKE 'course:%'")).rows;
 const vals = Object.fromEntries(rows.map(r=>[r.key,r.value])); res.json(courses.map(name=>({name,open:vals["course:"+name]!=="closed"})));
}));
app.get("/api/me", (req,res) => res.json({user:req.session.user||null}));
app.post("/api/register", asyncRoute(async (req,res) => {
 const name=clean(req.body.name,120), email=clean(req.body.email,180).toLowerCase(), password=String(req.body.password||"");
 if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<10) return res.status(400).json({error:"Enter your name, a valid email, and a password of at least 10 characters."});
 try { const result=await q("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'customer') RETURNING *",[name,email,bcrypt.hashSync(password,12)]); req.session.user=userPublic(result.rows[0]); res.json({user:req.session.user}); }
 catch(e) { if(e.code==="23505") return res.status(409).json({error:"That email is already registered."}); throw e; }
}));
app.post("/api/login", asyncRoute(async (req,res) => {
 const email=clean(req.body.email,180).toLowerCase(), password=String(req.body.password||""); const result=await q("SELECT * FROM users WHERE email=$1",[email]); const user=result.rows[0];
 if(!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:"Email or password is incorrect."});
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:"Could not start session."});req.session.user=userPublic(user);res.json({user:req.session.user});});
}));
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/dashboard",requireAuth,asyncRoute(async(req,res)=>{const uid=req.session.user.id; const [requests,orders,applications]=await Promise.all([q("SELECT * FROM requests WHERE user_id=$1 ORDER BY id DESC",[uid]),q("SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC",[uid]),q("SELECT * FROM applications WHERE user_id=$1 ORDER BY id DESC",[uid])]);res.json({requests:requests.rows,orders:orders.rows,applications:applications.rows});}));
app.post("/api/requests",requireAuth,asyncRoute(async(req,res)=>{const service=clean(req.body.service,160),details=clean(req.body.details,3000),method=clean(req.body.contact_method,80)||"Office visit";if(!service||details.length<5)return res.status(400).json({error:"Choose a service and describe what you need."});const refNo=ref("A9R");await q("INSERT INTO requests(ref,user_id,service_name,details,contact_method) VALUES($1,$2,$3,$4,$5)",[refNo,req.session.user.id,service,details,method]);res.json({ok:true,ref:refNo});}));
app.post("/api/orders",requireAuth,asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query("BEGIN");const productResult=await client.query("SELECT * FROM products WHERE id=$1 AND active=1 FOR UPDATE",[Number(req.body.product_id)]);const product=productResult.rows[0];const qty=Math.max(1,Math.min(100,Number.parseInt(req.body.quantity,10)||1));if(!product){await client.query("ROLLBACK");return res.status(400).json({error:"Product not found."});}if(product.stock<qty){await client.query("ROLLBACK");return res.status(400).json({error:"Not enough stock currently available. Please contact the office."});}const fulfilment=clean(req.body.fulfilment,80),address=clean(req.body.delivery_address,500);if(fulfilment==="Delivery"&&address.length<8){await client.query("ROLLBACK");return res.status(400).json({error:"Please provide a delivery address."});}const refNo=ref("A9O");await client.query("INSERT INTO orders(ref,user_id,product_name,quantity,unit_price,fulfilment,delivery_address) VALUES($1,$2,$3,$4,$5,$6,$7)",[refNo,req.session.user.id,product.name,qty,product.price,fulfilment||"Collect at office",address]);await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[qty,product.id]);await client.query("COMMIT");res.json({ok:true,ref:refNo});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}));
app.post("/api/applications",requireAuth,asyncRoute(async(req,res)=>{const course=clean(req.body.course_name,250),details=clean(req.body.details,2000);const training=await q("SELECT value FROM settings WHERE key='training_open'");if(training.rows[0]?.value==="no")return res.status(400).json({error:"Training applications are currently closed."});if(!courses.includes(course))return res.status(400).json({error:"Please select a valid course."});const courseSetting=await q("SELECT value FROM settings WHERE key=$1",["course:"+course]);if(courseSetting.rows[0]?.value==="closed")return res.status(400).json({error:"Applications for this course are closed."});const refNo=ref("A9T");await q("INSERT INTO applications(ref,user_id,course_name,details) VALUES($1,$2,$3,$4)",[refNo,req.session.user.id,course,details]);res.json({ok:true,ref:refNo});}));
app.get("/api/admin/summary",requireAdmin,asyncRoute(async(req,res)=>{const [customers,requests,orders,applications,requestRows,orderRows,appRows,products,services,training]=await Promise.all([q("SELECT COUNT(*)::int n FROM users WHERE role='customer'"),q("SELECT COUNT(*)::int n FROM requests"),q("SELECT COUNT(*)::int n FROM orders"),q("SELECT COUNT(*)::int n FROM applications"),q("SELECT r.*,u.name customer_name,u.email customer_email FROM requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100"),q("SELECT o.*,u.name customer_name,u.email customer_email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 100"),q("SELECT a.*,u.name customer_name,u.email customer_email FROM applications a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100"),q("SELECT * FROM products ORDER BY id DESC"),q("SELECT * FROM services ORDER BY category,name"),q("SELECT value FROM settings WHERE key='training_open'")]);res.json({counts:{customers:customers.rows[0].n,requests:requests.rows[0].n,orders:orders.rows[0].n,applications:applications.rows[0].n},requests:requestRows.rows,orders:orderRows.rows,applications:appRows.rows,products:products.rows,services:services.rows,trainingOpen:training.rows[0]?.value!=="no"});}));
app.post("/api/admin/products",requireAdmin,asyncRoute(async(req,res)=>{const name=clean(req.body.name,160),category=clean(req.body.category,100)||"Computers",description=clean(req.body.description,1500),price=Number(req.body.price),stock=Math.max(0,Math.min(100000,Number.parseInt(req.body.stock,10)||0)),image=clean(req.body.image_url,1000);if(name.length<2||!Number.isFinite(price)||price<0)return res.status(400).json({error:"Enter a product name and valid price."});await q("INSERT INTO products(name,category,description,price,stock,image_url) VALUES($1,$2,$3,$4,$5,$6)",[name,category,description,price,stock,image]);res.json({ok:true});}));
app.post("/api/admin/products/:id/delete",requireAdmin,asyncRoute(async(req,res)=>{await q("UPDATE products SET active=0 WHERE id=$1",[Number(req.params.id)]);res.json({ok:true});}));
app.post("/api/admin/services",requireAdmin,asyncRoute(async(req,res)=>{const name=clean(req.body.name,160),category=clean(req.body.category,100)||"General",description=clean(req.body.description,1500);if(name.length<2)return res.status(400).json({error:"Service name is required."});await q("INSERT INTO services(name,category,description) VALUES($1,$2,$3)",[name,category,description]);res.json({ok:true});}));
app.post("/api/admin/services/:id/delete",requireAdmin,asyncRoute(async(req,res)=>{await q("UPDATE services SET active=0 WHERE id=$1",[Number(req.params.id)]);res.json({ok:true});}));
app.post("/api/admin/requests/:id/status",requireAdmin,asyncRoute(async(req,res)=>{const status=clean(req.body.status,50),note=clean(req.body.admin_note,1000);if(!["Received","In Progress","Awaiting Customer","Completed","Cancelled"].includes(status))return res.status(400).json({error:"Invalid status."});await q("UPDATE requests SET status=$1,admin_note=$2 WHERE id=$3",[status,note,Number(req.params.id)]);res.json({ok:true});}));
app.post("/api/admin/orders/:id/status",requireAdmin,asyncRoute(async(req,res)=>{const status=clean(req.body.status,50),payment=clean(req.body.payment_status,50);if(!["Received","Processing","Ready for Collection","Out for Delivery","Completed","Cancelled"].includes(status)||!["Unpaid","Paid in Person","Part Paid"].includes(payment))return res.status(400).json({error:"Invalid status."});await q("UPDATE orders SET status=$1,payment_status=$2 WHERE id=$3",[status,payment,Number(req.params.id)]);res.json({ok:true});}));
app.post("/api/admin/applications/:id/status",requireAdmin,asyncRoute(async(req,res)=>{const status=clean(req.body.status,50),note=clean(req.body.admin_note,1000);if(!["Pending","Accepted","Rejected"].includes(status))return res.status(400).json({error:"Invalid status."});await q("UPDATE applications SET status=$1,admin_note=$2 WHERE id=$3",[status,note,Number(req.params.id)]);res.json({ok:true});}));
app.post("/api/admin/training",requireAdmin,asyncRoute(async(req,res)=>{const value=req.body.open==="yes"?"yes":"no";await q("UPDATE settings SET value=$1 WHERE key='training_open'",[value]);res.json({ok:true});}));
app.post("/api/admin/record-payment",requireAdmin,asyncRoute(async(req,res)=>{const type=clean(req.body.type,20),id=Number(req.body.id);if(type==="order"){await q("UPDATE orders SET payment_status='Paid in Person' WHERE id=$1",[id]);res.json({ok:true,receipt:"A9-REC-"+Date.now().toString(36).toUpperCase()});}else res.status(400).json({error:"Only order payments are supported by this quick record form."});}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

initDb().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`A9 Global Technologies portal running on port ${PORT}`))).catch(err=>{console.error("Database initialization failed:",err);process.exit(1);});
