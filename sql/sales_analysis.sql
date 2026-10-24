-- Sales Analysis (MySQL 8) | database: salesdb | table: sales_data
-- Columns: Order_ID, Order_Date, Customer, Region, Product, Sales, Cost, Profit, Year, Month
USE salesdb;

-- 1. Data check
SELECT COUNT(*) AS total_orders, MIN(Order_Date) AS first_order, MAX(Order_Date) AS last_order
FROM sales_data;

-- 2. Overall KPIs
SELECT SUM(Sales)  AS total_sales,
       SUM(Profit) AS total_profit,
       ROUND(SUM(Profit) * 100.0 / SUM(Sales), 2) AS profit_margin_pct,
       ROUND(AVG(Sales), 0) AS avg_order_value
FROM sales_data;

-- 3. Sales and profit by region
SELECT Region,
       SUM(Sales)  AS total_sales,
       SUM(Profit) AS total_profit,
       ROUND(SUM(Profit) * 100.0 / SUM(Sales), 1) AS margin_pct,
       ROUND(SUM(Profit) * 100.0 / SUM(SUM(Profit)) OVER (), 1) AS profit_share_pct
FROM sales_data
GROUP BY Region
ORDER BY total_profit DESC;

-- 4. Sales and profit by product
SELECT Product,
       SUM(Sales)  AS total_sales,
       SUM(Profit) AS total_profit,
       ROUND(SUM(Profit) * 100.0 / SUM(Sales), 1) AS margin_pct
FROM sales_data
GROUP BY Product
ORDER BY total_sales DESC;

-- 5. Monthly sales trend (year + month)
SELECT Year, Month, COUNT(*) AS orders, SUM(Sales) AS total_sales, SUM(Profit) AS total_profit
FROM sales_data
GROUP BY Year, Month
ORDER BY Year, Month;

-- 6. Month-over-month sales growth (window function)
WITH monthly AS (
    SELECT Year, Month, SUM(Sales) AS total_sales
    FROM sales_data
    GROUP BY Year, Month
)
SELECT Year, Month, total_sales,
       LAG(total_sales) OVER (ORDER BY Year, Month) AS prev_month_sales,
       ROUND((total_sales - LAG(total_sales) OVER (ORDER BY Year, Month)) * 100.0
             / LAG(total_sales) OVER (ORDER BY Year, Month), 1) AS mom_growth_pct
FROM monthly
ORDER BY Year, Month;

-- 7. Top 5 customers by profit
SELECT Customer, SUM(Sales) AS total_sales, SUM(Profit) AS total_profit
FROM sales_data
GROUP BY Customer
ORDER BY total_profit DESC
LIMIT 5;

-- 8. Best product within each region (RANK)
SELECT Region, Product, total_profit
FROM (
    SELECT Region, Product, SUM(Profit) AS total_profit,
           RANK() OVER (PARTITION BY Region ORDER BY SUM(Profit) DESC) AS rnk
    FROM sales_data
    GROUP BY Region, Product
) t
WHERE rnk = 1;
