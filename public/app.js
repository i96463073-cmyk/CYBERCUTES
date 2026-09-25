const state = { token: localStorage.getItem("cc_token"), user: null, services: [], orders: [] };
const $ = (id) => document.getElementById(id);

function toast(message, error=false) {
  const t = $("toast"); t.textContent = message; t.className = "toast show" + (error ? " error" : "");
  setTimeout(() => t.className = "toast", 3200);
}
async function api(path, options={}) {
  const headers = {"Content-Type":"application/json", ...(options.headers||{})};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const r = await fetch(path, {...options, headers});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(`view-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $("pageTitle").textContent = ({dashboard:"Dashboard",order:"New Order",services:"Services",orders:"Orders",funds:"Add Funds",support:"Support"})[name];
  document.querySelector(".sidebar").classList.remove("open");
}
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click",()=>showView(b.dataset.view)));
$("menuBtn").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");
$("logoutBtn").onclick=()=>{localStorage.removeItem("cc_token");location.reload()};

function renderOrders(target) {
  if (!state.orders.length) { $(target).innerHTML = `<div class="empty" style="padding:25px;color:#8f9ab3">No orders yet. Create your first order.</div>`; return; }
  $(target).innerHTML = `<table class="table"><thead><tr><th>ID</th><th>Service</th><th>Qty</th><th>Charge</th><th>Status</th></tr></thead><tbody>${
    state.orders.map(o=>`<tr><td>#${o.id}</td><td>${esc(o.service_name)}</td><td>${o.quantity}</td><td>KES ${Number(o.charge).toFixed(2)}</td><td><span class="status">${esc(o.status)}</span></td></tr>`).join("")
  }</tbody></table>`;
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

function renderServices(filter="") {
  const q=filter.toLowerCase();
  const list=state.services.filter(s=>`${s.name} ${s.category} ${s.description}`.toLowerCase().includes(q));
  $("serviceGrid").innerHTML=list.length?list.map(s=>`
    <div class="service-card">
      <span class="badge">${esc(s.category)}</span>
      <h4>${esc(s.name)}</h4>
      <p>${esc(s.description||"Professional social media service.")}</p>
      <div class="service-meta"><span>KES ${Number(s.rate).toFixed(2)} / 1K</span><span>${s.min_quantity}–${s.max_quantity}</span></div>
    </div>`).join(""):`<div class="service-card"><p>No matching services.</p></div>`;
}
function populateOrderForm() {
  const cats=[...new Set(state.services.map(s=>s.category))];
  $("categorySelect").innerHTML='<option value="">Select category</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");
  $("serviceSelect").innerHTML='<option value="">Select service</option>';
}
$("categorySelect").onchange=()=>{
  const c=$("categorySelect").value;
  const list=state.services.filter(s=>s.category===c);
  $("serviceSelect").innerHTML='<option value="">Select service</option>'+list.map(s=>`<option value="${s.id}">${esc(s.name)} — KES ${Number(s.rate).toFixed(2)}/1K</option>`).join("");
};
$("serviceSelect").onchange=()=>{
  const s=state.services.find(x=>x.id===Number($("serviceSelect").value));
  if(!s){$("serviceInfo").classList.add("hidden");return}
  $("serviceInfo").classList.remove("hidden");
  $("serviceInfo").innerHTML=`<strong>${esc(s.name)}</strong><br><small>${esc(s.description||"")}<br>Min ${s.min_quantity} · Max ${s.max_quantity} · KES ${Number(s.rate).toFixed(2)} per 1K</small>`;
  $("quantity").min=s.min_quantity;$("quantity").max=s.max_quantity;$("quantity").value=s.min_quantity;
  updateTotal();
};
$("quantity").oninput=updateTotal;
function updateTotal(){
  const s=state.services.find(x=>x.id===Number($("serviceSelect").value));
  const q=Number($("quantity").value)||0;
  $("orderTotal").textContent=`KES ${s?(Number(s.rate)*q/1000).toFixed(2):"0.00"}`;
}
$("placeOrderBtn").onclick=async()=>{
  try{
    const data=await api("/api/orders",{method:"POST",body:JSON.stringify({serviceId:Number($("serviceSelect").value),link:$("orderLink").value,quantity:Number($("quantity").value)})});
    toast(`Order #${data.orderId} created successfully`);
    await load();
    showView("orders");
  }catch(e){toast(e.message,true)}
};
$("serviceSearch").oninput=e=>renderServices(e.target.value);
$("payBtn").onclick=async()=>{
  try{
    const data=await api("/api/payments/create",{method:"POST",body:JSON.stringify({amount:Number($("fundAmount").value),email:$("fundEmail").value||state.user.email,phone:$("fundPhone").value})});
    if(data.redirectUrl) location.href=data.redirectUrl; else toast("Payment request created.");
  }catch(e){toast(e.message,true)}
};

async function load(){
  if(!state.token){return renderLogin();}
  try{
    state.user=await api("/api/me");
    state.services=await api("/api/services");
    state.orders=await api("/api/orders");
    $("userName").textContent=state.user.name;
    $("balance").textContent=Number(state.user.balance).toFixed(2);
    $("statBalance").textContent=`KES ${Number(state.user.balance).toFixed(2)}`;
    $("statOrders").textContent=state.orders.length;
    $("statServices").textContent=state.services.length;
    renderOrders("recentOrders");renderOrders("ordersTable");renderServices();populateOrderForm();
  }catch(e){localStorage.removeItem("cc_token");location.reload()}
}
function renderLogin(){
  document.querySelector(".app-shell").innerHTML=`
  <main style="width:100%;min-height:100vh;display:grid;place-items:center;padding:20px">
    <div class="form-card" style="width:min(440px,100%)">
      <div class="brand"><span class="brand-mark">C</span><span>CyberCute</span></div>
      <h2>Welcome back</h2><p class="muted">Sign in to your SMM dashboard.</p>
      <label>Email<input id="loginEmail" type="email" placeholder="you@example.com"></label>
      <label>Password<input id="loginPassword" type="password" placeholder="••••••••"></label>
      <button id="loginBtn" class="primary full">Sign In</button>
      <p id="loginMsg" class="muted"></p>
      <hr style="border-color:#27304a;border-width:1px 0 0;margin:22px 0">
      <p class="muted">New customer?</p>
      <button id="registerBtn" class="ghost">Create an account →</button>
    </div>
  </main>`;
  $("loginBtn").onclick=async()=>{try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})});state.token=d.token;localStorage.setItem("cc_token",state.token);location.reload()}catch(e){$("loginMsg").textContent=e.message}};
  $("registerBtn").onclick=renderRegister;
}
function renderRegister(){
  document.querySelector(".app-shell").innerHTML=`
  <main style="width:100%;min-height:100vh;display:grid;place-items:center;padding:20px">
    <div class="form-card" style="width:min(440px,100%)">
      <div class="brand"><span class="brand-mark">C</span><span>CyberCute</span></div>
      <h2>Create account</h2>
      <label>Name<input id="regName" placeholder="Your name"></label>
      <label>Email<input id="regEmail" type="email" placeholder="you@example.com"></label>
      <label>Phone<input id="regPhone" placeholder="2547XXXXXXXX"></label>
      <label>Password<input id="regPassword" type="password" placeholder="At least 8 characters"></label>
      <button id="regBtn" class="primary full">Create Account</button>
      <p id="regMsg" class="muted"></p>
      <button id="backBtn" class="ghost">← Back to login</button>
    </div>
  </main>`;
  $("regBtn").onclick=async()=>{try{const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name:$("regName").value,email:$("regEmail").value,phone:$("regPhone").value,password:$("regPassword").value})});state.token=d.token;localStorage.setItem("cc_token",state.token);location.reload()}catch(e){$("regMsg").textContent=e.message}};
  $("backBtn").onclick=renderLogin;
}
load();
