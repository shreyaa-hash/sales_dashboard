const DATA_FILES = ["../data/sales_cleaned.csv", "../data/sales_raw_new_2026.csv"];
const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const SHORT_CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const NUMBER = new Intl.NumberFormat("en-IN");

const elements = {
  yearFilter: document.querySelector("#year-filter"),
  regionFilter: document.querySelector("#region-filter"),
  exportButton: document.querySelector("#export-button"),
  message: document.querySelector("#data-message"),
  totalSales: document.querySelector("#total-sales"),
  totalProfit: document.querySelector("#total-profit"),
  profitMargin: document.querySelector("#profit-margin"),
  averageOrder: document.querySelector("#average-order"),
  ordersCaption: document.querySelector("#orders-caption"),
  dateCaption: document.querySelector("#date-caption"),
  trendChart: document.querySelector("#trend-chart"),
  trendSummary: document.querySelector("#trend-summary"),
  regionChart: document.querySelector("#region-chart"),
  productChart: document.querySelector("#product-chart"),
  customerList: document.querySelector("#customer-list"),
  insight: document.querySelector("#insight-copy"),
  footerRecords: document.querySelector("#footer-records"),
};

let allOrders = [];
let filteredOrders = [];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers || !headers.includes("Order_Date") || !headers.includes("Sales")) {
    throw new Error("A sales data file is missing the expected Order_Date or Sales column.");
  }
  return records.map((record) => Object.fromEntries(
    headers.map((header, index) => [header, record[index] ?? ""]),
  ));
}

function normalizeOrder(row) {
  const date = row.Order_Date;
  const sales = Number(row.Sales);
  const cost = Number(row.Cost);
  const parsedDate = new Date(`${date}T00:00:00`);
  if (!date || Number.isNaN(parsedDate.getTime()) || !Number.isFinite(sales) || !Number.isFinite(cost)) {
    throw new Error(`Invalid sales row encountered for order ${row.Order_ID || "unknown"}.`);
  }
  return {
    id: row.Order_ID,
    date,
    year: parsedDate.getFullYear(),
    month: parsedDate.getMonth() + 1,
    customer: row.Customer,
    region: row.Region,
    product: row.Product,
    sales,
    profit: row.Profit === undefined || row.Profit === "" ? sales - cost : Number(row.Profit),
  };
}

async function loadOrders() {
  const responses = await Promise.all(DATA_FILES.map((file) => fetch(file)));
  const failedResponse = responses.find((response) => !response.ok);
  if (failedResponse) {
    throw new Error(`Could not load sales data (${failedResponse.url}, HTTP ${failedResponse.status}). Start a local web server from the project root.`);
  }
  const csvFiles = await Promise.all(responses.map((response) => response.text()));
  const orders = csvFiles.flatMap(parseCsv).map(normalizeOrder);
  if (orders.length === 0) throw new Error("No sales records were found in the project data files.");
  return orders.sort((left, right) => left.date.localeCompare(right.date));
}

function sum(orders, key) {
  return orders.reduce((total, order) => total + order[key], 0);
}

function groupBy(orders, keyFn) {
  const groups = new Map();
  for (const order of orders) {
    const key = keyFn(order);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  }
  return groups;
}

function aggregate(orders, keyFn) {
  return Array.from(groupBy(orders, keyFn), ([key, rows]) => ({
    key,
    sales: sum(rows, "sales"),
    profit: sum(rows, "profit"),
    orders: rows.length,
    margin: sum(rows, "sales") ? (sum(rows, "profit") / sum(rows, "sales")) * 100 : 0,
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.classList.add("is-visible");
  elements.message.classList.toggle("is-error", isError);
}

function hideMessage() {
  elements.message.textContent = "";
  elements.message.classList.remove("is-visible", "is-error");
}

function populateFilters(orders) {
  const years = Array.from(new Set(orders.map((order) => order.year))).sort((a, b) => a - b);
  const regions = Array.from(new Set(orders.map((order) => order.region))).sort();
  for (const year of years) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    elements.yearFilter.append(option);
  }
  for (const region of regions) {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    elements.regionFilter.append(option);
  }
}

function drawTrend(orders) {
  const monthly = aggregate(orders, (order) => `${order.year}-${String(order.month).padStart(2, "0")}`)
    .sort((left, right) => left.key.localeCompare(right.key));
  if (!monthly.length) {
    elements.trendChart.innerHTML = '<p class="empty-state">No sales in this selection.</p>';
    elements.trendSummary.textContent = "";
    return;
  }

  const width = 720;
  const height = 194;
  const padding = { top: 14, right: 12, bottom: 30, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...monthly.map((entry) => entry.sales), 1);
  const step = maxValue / 3;
  const points = monthly.map((entry, index) => ({
    ...entry,
    x: padding.left + (monthly.length === 1 ? plotWidth / 2 : (index / (monthly.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (entry.sales / (maxValue * 1.12)) * plotHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${padding.top + plotHeight} ${line} ${padding.left + plotWidth},${padding.top + plotHeight}`;
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = step * index;
    const y = padding.top + plotHeight - (value / (maxValue * 1.12)) * plotHeight;
    return `<line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line><text class="chart-axis-label" x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${escapeHtml(SHORT_CURRENCY.format(value).replace("₹", ""))}</text>`;
  }).join("");
  const tickInterval = Math.max(1, Math.ceil(points.length / 7));
  const labels = points.map((point, index) => {
    if (index % tickInterval !== 0 && index !== points.length - 1) return "";
    const [year, month] = point.key.split("-").map(Number);
    const label = new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month - 1));
    return `<text class="chart-x-label" x="${point.x}" y="${height - 8}" text-anchor="middle">${label} '${String(year).slice(-2)}</text>`;
  }).join("");
  const dots = points.map((point) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="3.2"><title>${escapeHtml(point.key)} · ${escapeHtml(CURRENCY.format(point.sales))}</title></circle>`).join("");
  elements.trendChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Sales by month">
    <defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#a8c58e" stop-opacity=".34"></stop><stop offset="100%" stop-color="#a8c58e" stop-opacity=".015"></stop></linearGradient></defs>
    ${grid}<polygon class="chart-area" points="${area}"></polygon><polyline class="chart-line" points="${line}"></polyline>${dots}${labels}
  </svg>`;
  const first = monthly[0];
  const last = monthly[monthly.length - 1];
  elements.trendSummary.textContent = monthly.length > 1
    ? `${monthly.length} months · ${first.key.slice(0, 4)}–${last.key.slice(0, 4)}`
    : "1 month";
}

function drawRegions(orders) {
  const regions = aggregate(orders, (order) => order.region).sort((a, b) => b.profit - a.profit);
  if (!regions.length) {
    elements.regionChart.innerHTML = '<p class="empty-state">No regional data in this selection.</p>';
    return;
  }
  const maxProfit = Math.max(...regions.map((region) => region.profit), 1);
  const totalProfit = sum(orders, "profit");
  elements.regionChart.innerHTML = regions.map((region) => {
    const share = totalProfit ? (region.profit / totalProfit) * 100 : 0;
    return `<div class="region-row">
      <span class="region-name">${escapeHtml(region.key)}</span>
      <span class="bar-track"><span class="bar-fill" style="display:block;width:${Math.max(0, (region.profit / maxProfit) * 100)}%"></span></span>
      <span class="bar-amount">${escapeHtml(SHORT_CURRENCY.format(region.profit))}</span>
      <span class="bar-margin">${region.margin.toFixed(1)}%</span>
    </div><span class="sr-only">${share.toFixed(1)}% of total profit</span>`;
  }).join("");
}

function drawProducts(orders) {
  const products = aggregate(orders, (order) => order.product).sort((a, b) => b.sales - a.sales);
  if (!products.length) {
    elements.productChart.innerHTML = '<p class="empty-state">No product data in this selection.</p>';
    return;
  }
  const maxSales = Math.max(...products.map((product) => product.sales), 1);
  elements.productChart.innerHTML = products.map((product) => `
    <div class="product-row">
      <span class="product-name" title="${escapeHtml(product.key)}">${escapeHtml(product.key)}</span>
      <span class="bar-track"><span class="bar-fill" style="display:block;width:${Math.max(0, (product.sales / maxSales) * 100)}%"></span></span>
      <span class="product-sales">${escapeHtml(SHORT_CURRENCY.format(product.sales))}</span>
      <span class="product-margin">${product.margin.toFixed(1)}%</span>
    </div>`).join("");
}

function drawCustomers(orders) {
  const customers = aggregate(orders, (order) => order.customer)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);
  if (!customers.length) {
    elements.customerList.innerHTML = '<p class="empty-state">No customer data in this selection.</p>';
    return;
  }
  elements.customerList.innerHTML = customers.map((customer, index) => `
    <div class="customer-row">
      <span class="rank-badge">${String(index + 1).padStart(2, "0")}</span>
      <span class="customer-name">${escapeHtml(customer.key)}<span class="customer-subtitle">${NUMBER.format(customer.orders)} orders</span></span>
      <span class="customer-revenue">${escapeHtml(SHORT_CURRENCY.format(customer.profit))}</span>
    </div>`).join("");
}

function renderInsight(orders) {
  if (!orders.length) {
    elements.insight.textContent = "No orders match the selected filters. Try a different period or region.";
    return;
  }
  const regions = aggregate(orders, (order) => order.region).sort((a, b) => b.profit - a.profit);
  const products = aggregate(orders, (order) => order.product).sort((a, b) => b.sales - a.sales);
  const topRegion = regions[0];
  const topProduct = products[0];
  elements.insight.textContent = `${topRegion.key} leads profitability with ${CURRENCY.format(topRegion.profit)} in profit, while ${topProduct.key} is the top-selling product at ${CURRENCY.format(topProduct.sales)}.`;
}

function render() {
  const year = elements.yearFilter.value;
  const region = elements.regionFilter.value;
  filteredOrders = allOrders.filter((order) =>
    (year === "all" || String(order.year) === year) &&
    (region === "all" || order.region === region),
  );
  const sales = sum(filteredOrders, "sales");
  const profit = sum(filteredOrders, "profit");
  const count = filteredOrders.length;
  const dates = filteredOrders.map((order) => order.date).sort();
  elements.totalSales.textContent = CURRENCY.format(sales);
  elements.totalProfit.textContent = CURRENCY.format(profit);
  elements.profitMargin.textContent = `${sales ? ((profit / sales) * 100).toFixed(2) : "0.00"}%`;
  elements.averageOrder.textContent = CURRENCY.format(count ? sales / count : 0);
  elements.ordersCaption.textContent = `${NUMBER.format(count)} ${count === 1 ? "order" : "orders"}`;
  elements.dateCaption.textContent = dates.length
    ? `${dates[0]} to ${dates[dates.length - 1]}`
    : "No orders in selected period";
  elements.footerRecords.textContent = `${NUMBER.format(count)} ORDERS · ${year === "all" ? "ALL YEARS" : year.toUpperCase()}`;
  drawTrend(filteredOrders);
  drawRegions(filteredOrders);
  drawProducts(filteredOrders);
  drawCustomers(filteredOrders);
  renderInsight(filteredOrders);
}

function exportCsv() {
  const columns = ["Order_ID", "Order_Date", "Customer", "Region", "Product", "Sales", "Profit"];
  const lines = [columns.join(","), ...filteredOrders.map((order) => [
    order.id, order.date, order.customer, order.region, order.product, order.sales, order.profit,
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sales-dashboard-export.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function initialize() {
  try {
    allOrders = await loadOrders();
    populateFilters(allOrders);
    elements.yearFilter.addEventListener("change", render);
    elements.regionFilter.addEventListener("change", render);
    elements.exportButton.addEventListener("click", exportCsv);
    elements.exportButton.disabled = false;
    hideMessage();
    render();
  } catch (error) {
    console.error("Unable to initialize the sales dashboard.", error);
    showMessage(`${error.message} From the project root, run: python -m http.server 8000, then open http://localhost:8000/dashboard/`, true);
    elements.footerRecords.textContent = "DATA SOURCE UNAVAILABLE";
  }
}

initialize();
