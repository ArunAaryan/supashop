-- Phase 5 E2E seed: store profile, hours, serviceable postal code, and a
-- single catalog offering. Idempotent: clears domain data first, then inserts.
-- User accounts are NOT cleared here; the specs create unique users per run.

DELETE FROM delivery_proof;
DELETE FROM checkout_idempotency;
DELETE FROM order_status_history;
DELETE FROM order_item;
DELETE FROM order_address;
DELETE FROM inventory_movement;
DELETE FROM commerce_order;
DELETE FROM customer_address;
DELETE FROM cart_item;
DELETE FROM cart;
DELETE FROM audit_log;
DELETE FROM offering;
DELETE FROM product;
DELETE FROM category;
DELETE FROM store_hours;
DELETE FROM serviceable_postal_code;
DELETE FROM store_profile;

INSERT INTO store_profile (singleton_key, name, contact_name, phone, email, address_line_1, city, state, postal_code, timezone, order_cutoff_minutes, created_at, updated_at)
VALUES (1, 'SupaShop Market', 'Store Owner', '+919876543210', 'owner@supashop.test', '12 Market Road', 'Bengaluru', 'Karnataka', '560001', 'Asia/Kolkata', NULL, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER));

INSERT INTO store_hours (id, weekday, opens_minute, closes_minute, closed) VALUES
  ('hours-0', 0, 0, 1439, 0),
  ('hours-1', 1, 0, 1439, 0),
  ('hours-2', 2, 0, 1439, 0),
  ('hours-3', 3, 0, 1439, 0),
  ('hours-4', 4, 0, 1439, 0),
  ('hours-5', 5, 0, 1439, 0),
  ('hours-6', 6, 0, 1439, 0);

INSERT INTO serviceable_postal_code (postal_code, active) VALUES ('560001', 1);

INSERT INTO category (id, name, slug, description, active, created_at, updated_at)
VALUES ('cat-milk', 'Dairy', 'dairy', 'Milk and chilled dairy products', 1, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER));

INSERT INTO category (id, name, slug, description, active, created_at, updated_at)
VALUES ('cat-bakery', 'Bakery', 'bakery', 'Fresh bread and bakes', 1, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER));

INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at)
VALUES ('prod-milk', 'MILK-1', 'whole-milk', 'Whole Milk', 'Fresh full-cream milk in a resealable pouch', 'cat-milk', 1, 1, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER));

INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at)
VALUES ('prod-bread', 'BREAD-1', 'sourdough', 'Sourdough Bread', 'Slow-fermented crusty sourdough loaf', 'cat-bakery', 1, 1, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER));

INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at)
VALUES ('offer-milk', 'prod-milk', 'MILK-1L', '1 litre pouch', 1, 5000, 'none', 0, 20, 3, 1, 1, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER));

INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at)
VALUES ('offer-bread', 'prod-bread', 'BREAD-500G', '500g loaf', 1, 3000, 'none', 0, 15, 2, 1, 1, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER));
