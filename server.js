require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "a9global.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS services (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Computers',
 description TEXT NOT NULL DEFAULT '', price REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
 image_url TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
 service_name TEXT NOT NULL, details TEXT NOT NULL, contact_method TEXT NOT NULL DEFAULT 'Office visit',
 status TEXT NOT NULL DEFAULT 'Received', admin_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
 product_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, unit_price REAL NOT NULL,
 fulfilment TEXT NOT NULL DEFAULT 'Collect at office', delivery_address TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Received', payment_status TEXT NOT NULL DEFAULT 'Unpaid',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
 course_name TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending',
 admin_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

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
const insertService = db.prepare("INSERT INTO services(name,category,description) VALUES(?,?,?)");
if (db.prepare("SELECT COUNT(*) n FROM services").get().n === 0) {
  const tx = db.transaction(() => defaultServices.forEach(s => insertService.run(...s)));
  tx();
}
const courses = [
"Certificate in Computer Operation and Management",
"Certificate in Microsoft Offices (Word, Excel, PowerPoint and office apps)",
"Certificate in Basics of Cyber Security"
];
for (const c of courses) {
  const key = "course:" + c;
  if (!db.prepare("SELECT key FROM settings WHERE key=?").get(key))
    db.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(key, "open");
}
if (!db.prepare("SELECT key FROM settings WHERE key='training_open'").get())
  db.prepare("INSERT INTO settings(key,value) VALUES('training_open','yes')");

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const existing = db.prepare("SELECT id,role FROM users WHERE email=?").get(email);
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  if (!existing) db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run("Website Owner", email, hash);
  else if (existing.role === "admin") db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, existing.id);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: dataDir }),
  secret: process.env.SESSION_SECRET || "unsafe-development-secret-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req,res,next) {
  if (!req.session.user) return res.status(401).json({ error: "Please sign in first." });
  next();
}
function requireAdmin(req,res,next) {
  if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "Owner access only." });
  next();
}
function clean(v, max=2000) { return String(v ?? "").trim().slice(0,max); }
function ref(prefix) { return prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2,6).toUpperCase(); }
function userPublic(u) { return { id:u.id, name:u.name, email:u.email, role:u.role }; }

app.get("/api/config", (req,res) => res.json({
 company: { name:"A9 Global Technologies", tagline:"Customer Satisfaction Is Our No. 1 Priority", email:"service.a9globaltechltd@gmail.com", phone:"07069362725", address:"No. 5 Zaria Road, opposite Rabiu Wise, Funtua, Katsina State" },
 user: req.session.user || null,
 trainingOpen: db.prepare("SELECT value FROM settings WHERE key='training_open'").get()?.value !== "no"
}));
app.get("/api/services", (req,res) => res.json(db.prepare("SELECT * FROM services WHERE active=1 ORDER BY category,name").all()));
app.get("/api/products", (req,res) => res.json(db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all()));
app.get("/api/courses", (req,res) => res.json(courses.map(name => ({name, open: db.prepare("SELECT value FROM settings WHERE key=?").get("course:"+name)?.value !== "closed"}))));
app.get("/api/me", (req,res) => res.json({ user: req.session.user || null }));
app.post("/api/register", (req,res) => {
 const name=clean(req.body.name,120), email=clean(req.body.email,180).toLowerCase(), password=String(req.body.password||"");
 if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<10) return res.status(400).json({error:"Enter your name, a valid email, and a password of at least 10 characters."});
 try {
  const info=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'customer')").run(name,email,bcrypt.hashSync(password,12));
  const user=db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  req.session.user=userPublic(user); res.json({user:req.session.user});
 } catch(e) { res.status(409).json({error:"That email is already registered."}); }
});
app.post("/api/login", (req,res) => {
 const email=clean(req.body.email,180).toLowerCase(), password=String(req.body.password||"");
 const user=db.prepare("SELECT * FROM users WHERE email=?").get(email);
 if(!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:"Email or password is incorrect."});
 req.session.regenerate(err => { if(err) return res.status(500).json({error:"Could not start session."}); req.session.user=userPublic(user); res.json({user:req.session.user}); });
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/dashboard", requireAuth, (req,res) => {
 const uid=req.session.user.id;
 res.json({
  requests:db.prepare("SELECT * FROM requests WHERE user_id=? ORDER BY id DESC").all(uid),
  orders:db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(uid),
  applications:db.prepare("SELECT * FROM applications WHERE user_id=? ORDER BY id DESC").all(uid)
 });
});
app.post("/api/requests",requireAuth,(req,res)=>{
 const service=clean(req.body.service,160), details=clean(req.body.details,3000), method=clean(req.body.contact_method,80)||"Office visit";
 if(!service || details.length<5) return res.status(400).json({error:"Choose a service and describe what you need."});
 const refNo=ref("A9R");
 db.prepare("INSERT INTO requests(ref,user_id,service_name,details,contact_method) VALUES(?,?,?,?,?)").run(refNo,req.session.user.id,service,details,method);
 res.json({ok:true,ref:refNo});
});
app.post("/api/orders",requireAuth,(req,res)=>{
 const product=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(req.body.product_id));
 const qty=Math.max(1,Math.min(100,Number.parseInt(req.body.quantity,10)||1));
 if(!product) return res.status(400).json({error:"Product not found."});
 if(product.stock < qty) return res.status(400).json({error:"Not enough stock currently available. Please contact the office."});
 const fulfilment=clean(req.body.fulfilment,80), address=clean(req.body.delivery_address,500);
 if(fulfilment==="Delivery" && address.length<8) return res.status(400).json({error:"Please provide a delivery address."});
 const refNo=ref("A9O");
 db.prepare("INSERT INTO orders(ref,user_id,product_name,quantity,unit_price,fulfilment,delivery_address) VALUES(?,?,?,?,?,?,?)").run(refNo,req.session.user.id,product.name,qty,product.price,fulfilment||"Collect at office",address);
 db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(qty,product.id);
 res.json({ok:true,ref:refNo});
});
app.post("/api/applications",requireAuth,(req,res)=>{
 const course=clean(req.body.course_name,250), details=clean(req.body.details,2000);
 if(db.prepare("SELECT value FROM settings WHERE key='training_open'").get()?.value==="no") return res.status(400).json({error:"Training applications are currently closed."});
 if(!courses.includes(course)) return res.status(400).json({error:"Please select a valid course."});
 if(db.prepare("SELECT value FROM settings WHERE key=?").get("course:"+course)?.value==="closed") return res.status(400).json({error:"Applications for this course are closed."});
 const refNo=ref("A9T");
 db.prepare("INSERT INTO applications(ref,user_id,course_name,details) VALUES(?,?,?,?)").run(refNo,req.session.user.id,course,details);
 res.json({ok:true,ref:refNo});
});

// Admin summary and management
app.get("/api/admin/summary",requireAdmin,(req,res)=>res.json({
 counts:{
  customers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='customer'").get().n,
  requests:db.prepare("SELECT COUNT(*) n FROM requests").get().n,
  orders:db.prepare("SELECT COUNT(*) n FROM orders").get().n,
  applications:db.prepare("SELECT COUNT(*) n FROM applications").get().n
 },
 requests:db.prepare("SELECT r.*,u.name customer_name,u.email customer_email FROM requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100").all(),
 orders:db.prepare("SELECT o.*,u.name customer_name,u.email customer_email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 100").all(),
 applications:db.prepare("SELECT a.*,u.name customer_name,u.email customer_email FROM applications a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100").all(),
 products:db.prepare("SELECT * FROM products ORDER BY id DESC").all(),
 services:db.prepare("SELECT * FROM services ORDER BY category,name").all(),
 trainingOpen:db.prepare("SELECT value FROM settings WHERE key='training_open'").get()?.value !== "no"
}));
app.post("/api/admin/products",requireAdmin,(req,res)=>{
 const name=clean(req.body.name,160), category=clean(req.body.category,100)||"Computers", description=clean(req.body.description,1500), price=Number(req.body.price), stock=Math.max(0,Math.min(100000,Number.parseInt(req.body.stock,10)||0)), image=clean(req.body.image_url,1000);
 if(name.length<2 || !Number.isFinite(price)||price<0) return res.status(400).json({error:"Enter a product name and valid price."});
 db.prepare("INSERT INTO products(name,category,description,price,stock,image_url) VALUES(?,?,?,?,?,?)").run(name,category,description,price,stock,image);
 res.json({ok:true});
});
app.post("/api/admin/products/:id/delete",requireAdmin,(req,res)=>{db.prepare("UPDATE products SET active=0 WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.post("/api/admin/services",requireAdmin,(req,res)=>{
 const name=clean(req.body.name,160), category=clean(req.body.category,100)||"General", description=clean(req.body.description,1500);
 if(name.length<2)return res.status(400).json({error:"Service name is required."});
 db.prepare("INSERT INTO services(name,category,description) VALUES(?,?,?)").run(name,category,description);res.json({ok:true});
});
app.post("/api/admin/services/:id/delete",requireAdmin,(req,res)=>{db.prepare("UPDATE services SET active=0 WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.post("/api/admin/requests/:id/status",requireAdmin,(req,res)=>{
 const status=clean(req.body.status,50), note=clean(req.body.admin_note,1000);
 if(!["Received","In Progress","Awaiting Customer","Completed","Cancelled"].includes(status))return res.status(400).json({error:"Invalid status."});
 db.prepare("UPDATE requests SET status=?,admin_note=? WHERE id=?").run(status,note,Number(req.params.id));res.json({ok:true});
});
app.post("/api/admin/orders/:id/status",requireAdmin,(req,res)=>{
 const status=clean(req.body.status,50), payment=clean(req.body.payment_status,50);
 if(!["Received","Processing","Ready for Collection","Out for Delivery","Completed","Cancelled"].includes(status)||!["Unpaid","Paid in Person","Part Paid"].includes(payment))return res.status(400).json({error:"Invalid status."});
 db.prepare("UPDATE orders SET status=?,payment_status=? WHERE id=?").run(status,payment,Number(req.params.id));res.json({ok:true});
});
app.post("/api/admin/applications/:id/status",requireAdmin,(req,res)=>{
 const status=clean(req.body.status,50), note=clean(req.body.admin_note,1000);
 if(!["Pending","Accepted","Rejected"].includes(status))return res.status(400).json({error:"Invalid status."});
 db.prepare("UPDATE applications SET status=?,admin_note=? WHERE id=?").run(status,note,Number(req.params.id));res.json({ok:true});
});
app.post("/api/admin/training",requireAdmin,(req,res)=>{
 const value=req.body.open==="yes"?"yes":"no";
 db.prepare("UPDATE settings SET value=? WHERE key='training_open'").run(value);res.json({ok:true});
});
app.post("/api/admin/record-payment",requireAdmin,(req,res)=>{
 const type=clean(req.body.type,20), id=Number(req.body.id);
 if(type==="order") {
  db.prepare("UPDATE orders SET payment_status='Paid in Person' WHERE id=?").run(id);
  res.json({ok:true,receipt:"A9-REC-"+Date.now().toString(36).toUpperCase()});
 } else res.status(400).json({error:"Only order payments are supported by this quick record form."});
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`A9 Global Technologies portal running on port ${PORT}`));
