-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.areas (
  id_area uuid NOT NULL DEFAULT gen_random_uuid(),
  description text,
  status character DEFAULT 'A'::bpchar,
  is_selected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT areas_pkey PRIMARY KEY (id_area)
);
CREATE TABLE public.cart_items (
  id_cart_item uuid NOT NULL DEFAULT gen_random_uuid(),
  id_cart uuid,
  id_item uuid,
  quantity integer DEFAULT 1,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cart_items_pkey PRIMARY KEY (id_cart_item),
  CONSTRAINT cart_items_id_cart_fkey FOREIGN KEY (id_cart) REFERENCES public.carts(id_cart),
  CONSTRAINT cart_items_id_item_fkey FOREIGN KEY (id_item) REFERENCES public.items(id_item)
);
CREATE TABLE public.carts (
  id_cart uuid NOT NULL DEFAULT gen_random_uuid(),
  id_client uuid,
  session_id text,
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT carts_pkey PRIMARY KEY (id_cart),
  CONSTRAINT carts_id_client_fkey FOREIGN KEY (id_client) REFERENCES public.clients(id_client)
);
CREATE TABLE public.catalog_sat (
  id_sat text NOT NULL,
  description text,
  CONSTRAINT catalog_sat_pkey PRIMARY KEY (id_sat)
);
CREATE TABLE public.categories (
  id_category uuid NOT NULL DEFAULT gen_random_uuid(),
  description text,
  status character DEFAULT 'A'::bpchar,
  is_selected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id_category)
);
CREATE TABLE public.clients (
  id_client uuid NOT NULL DEFAULT gen_random_uuid(),
  id_auth_user uuid,
  first_name text,
  last_name text,
  email text UNIQUE,
  phone text,
  rfc text,
  address text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'MX'::text,
  status character DEFAULT 'A'::bpchar,
  created_at timestamp with time zone DEFAULT now(),
  price_number numeric DEFAULT '1'::numeric,
  CONSTRAINT clients_pkey PRIMARY KEY (id_client),
  CONSTRAINT clients_id_auth_user_fkey FOREIGN KEY (id_auth_user) REFERENCES auth.users(id)
);
CREATE TABLE public.departments (
  id_department uuid NOT NULL DEFAULT gen_random_uuid(),
  description text,
  status character DEFAULT 'A'::bpchar,
  is_selected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT departments_pkey PRIMARY KEY (id_department)
);
CREATE TABLE public.item_images (
  id_item_image uuid NOT NULL DEFAULT gen_random_uuid(),
  id_item uuid,
  created_at timestamp with time zone DEFAULT now(),
  image_url text,
  image_path text,
  CONSTRAINT item_images_pkey PRIMARY KEY (id_item_image),
  CONSTRAINT item_images_id_item_fkey FOREIGN KEY (id_item) REFERENCES public.items(id_item)
);
CREATE TABLE public.items (
  id_item uuid NOT NULL DEFAULT gen_random_uuid(),
  code character varying,
  barcode character varying,
  description text,
  description_short text,
  type character,
  id_area uuid,
  id_department uuid,
  id_category uuid,
  unit text,
  cost numeric,
  last_cost numeric,
  price numeric,
  tax numeric DEFAULT 8,
  comission numeric,
  status character DEFAULT 'A'::bpchar,
  id_sat text,
  unit_sat text,
  created_at timestamp with time zone DEFAULT now(),
  price1 numeric,
  price2 numeric,
  price3 numeric,
  CONSTRAINT items_pkey PRIMARY KEY (id_item),
  CONSTRAINT items_id_area_fkey FOREIGN KEY (id_area) REFERENCES public.areas(id_area),
  CONSTRAINT items_id_department_fkey FOREIGN KEY (id_department) REFERENCES public.departments(id_department),
  CONSTRAINT items_id_category_fkey FOREIGN KEY (id_category) REFERENCES public.categories(id_category)
);
CREATE TABLE public.location_label_settings (
  id_label_setting uuid NOT NULL DEFAULT gen_random_uuid(),
  id_location uuid UNIQUE,
  printer_name text,
  paper_width numeric DEFAULT 50.00,
  paper_height numeric DEFAULT 25.00,
  margin_top numeric DEFAULT 1.00,
  margin_bottom numeric DEFAULT 1.00,
  margin_left numeric DEFAULT 1.00,
  margin_right numeric DEFAULT 1.00,
  font_size numeric DEFAULT 8.0,
  barcode_height numeric DEFAULT 10.00,
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT location_label_settings_pkey PRIMARY KEY (id_label_setting),
  CONSTRAINT location_label_settings_id_location_fkey FOREIGN KEY (id_location) REFERENCES public.locations(id_location)
);
CREATE TABLE public.locations (
  id_location uuid NOT NULL DEFAULT gen_random_uuid(),
  id_store uuid,
  description text,
  status character DEFAULT 'A'::bpchar,
  is_selected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT locations_pkey PRIMARY KEY (id_location),
  CONSTRAINT locations_id_store_fkey FOREIGN KEY (id_store) REFERENCES public.stores(id_store)
);
CREATE TABLE public.order_items (
  id_order_item uuid NOT NULL DEFAULT gen_random_uuid(),
  id_order uuid,
  id_item uuid,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT order_items_pkey PRIMARY KEY (id_order_item),
  CONSTRAINT order_items_id_item_fkey FOREIGN KEY (id_item) REFERENCES public.items(id_item),
  CONSTRAINT order_items_id_order_fkey FOREIGN KEY (id_order) REFERENCES public.orders(id_order)
);
CREATE TABLE public.orders (
  id_order uuid NOT NULL DEFAULT gen_random_uuid(),
  order_number integer NOT NULL DEFAULT nextval('orders_order_number_seq'::regclass),
  id_client uuid,
  id_store uuid,
  total_amount numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  shipping_cost numeric DEFAULT 0,
  status text DEFAULT 'pending'::text,
  payment_method text,
  payment_reference text,
  shipping_address jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id_order),
  CONSTRAINT orders_id_client_fkey FOREIGN KEY (id_client) REFERENCES public.clients(id_client),
  CONSTRAINT orders_id_store_fkey FOREIGN KEY (id_store) REFERENCES public.stores(id_store)
);
CREATE TABLE public.price_history (
  id_price_history uuid NOT NULL DEFAULT gen_random_uuid(),
  id_item uuid,
  price numeric NOT NULL,
  cost numeric,
  tax numeric,
  price_type text,
  valid_from timestamp with time zone NOT NULL DEFAULT now(),
  valid_to timestamp with time zone,
  changed_by uuid,
  comments text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT price_history_pkey PRIMARY KEY (id_price_history)
);
CREATE TABLE public.shipping_addresses (
  id_address uuid NOT NULL DEFAULT gen_random_uuid(),
  id_client uuid NOT NULL,
  alias text,
  recipient_name text,
  street text,
  exterior_num text,
  interior_num text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  phone text,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT shipping_addresses_pkey PRIMARY KEY (id_address),
  CONSTRAINT shipping_addresses_id_client_fkey FOREIGN KEY (id_client) REFERENCES public.clients(id_client)
);
CREATE TABLE public.stocks (
  id_stock uuid NOT NULL DEFAULT gen_random_uuid(),
  id_item uuid,
  id_store uuid,
  id_location uuid,
  initial integer DEFAULT 0,
  previous integer DEFAULT 0,
  current integer DEFAULT 0,
  maximum integer DEFAULT 0,
  minimum integer DEFAULT 0,
  reorder_point integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stocks_pkey PRIMARY KEY (id_stock),
  CONSTRAINT stocks_id_item_fkey FOREIGN KEY (id_item) REFERENCES public.items(id_item),
  CONSTRAINT stocks_id_store_fkey FOREIGN KEY (id_store) REFERENCES public.stores(id_store),
  CONSTRAINT stocks_id_location_fkey FOREIGN KEY (id_location) REFERENCES public.locations(id_location)
);
CREATE TABLE public.stores (
  id_store uuid NOT NULL DEFAULT gen_random_uuid(),
  description text,
  location text,
  status character DEFAULT 'A'::bpchar,
  is_selected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stores_pkey PRIMARY KEY (id_store)
);
CREATE TABLE public.suppliers (
  id_supplier uuid NOT NULL DEFAULT gen_random_uuid(),
  supplier_name text,
  rfc text,
  address text,
  city text,
  state text,
  postal_code text,
  phone text,
  email1 text,
  email2 text,
  web_page text,
  contact text,
  credit_days integer DEFAULT 0,
  credit_limit numeric DEFAULT 0,
  status character DEFAULT 'A'::bpchar,
  is_selected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id_supplier)
);
CREATE TABLE public.transactions (
  id_transaction uuid NOT NULL DEFAULT gen_random_uuid(),
  id_store uuid,
  id_location uuid,
  id_item uuid,
  id_user uuid,
  date_transaction timestamp with time zone DEFAULT now(),
  movim_type character,
  reference text,
  amount_enrty integer DEFAULT 0,
  amount_exit integer DEFAULT 0,
  cost numeric DEFAULT 0,
  price numeric DEFAULT 0,
  concept text,
  origin text,
  comments text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id_transaction)
);
CREATE TABLE public.users (
  id_user uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text,
  user_name text,
  role text,
  password_hash text,
  email text,
  phone text,
  status character DEFAULT 'A'::bpchar,
  image bytea,
  last_access timestamp with time zone,
  date_final timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id_user)
);

CREATE TABLE public.inventory_sessions (
  id_session uuid NOT NULL DEFAULT gen_random_uuid(),
  id_store uuid,
  id_user uuid,
  status character DEFAULT 'A'::bpchar,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  CONSTRAINT inventory_sessions_pkey PRIMARY KEY (id_session),
  CONSTRAINT inventory_sessions_id_store_fkey FOREIGN KEY (id_store) REFERENCES public.stores(id_store),
  CONSTRAINT inventory_sessions_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id_user)
);

CREATE TABLE public.inventory_readings (
  id_reading uuid NOT NULL DEFAULT gen_random_uuid(),
  id_session uuid,
  id_item uuid,
  id_store uuid,
  id_location uuid,
  id_user uuid,
  quantity integer DEFAULT 1,
  stock_before integer DEFAULT 0,
  stock_physical integer DEFAULT 0,
  stock_diff integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_readings_pkey PRIMARY KEY (id_reading),
  CONSTRAINT inventory_readings_id_session_fkey FOREIGN KEY (id_session) REFERENCES public.inventory_sessions(id_session),
  CONSTRAINT inventory_readings_id_item_fkey FOREIGN KEY (id_item) REFERENCES public.items(id_item),
  CONSTRAINT inventory_readings_id_store_fkey FOREIGN KEY (id_store) REFERENCES public.stores(id_store),
  CONSTRAINT inventory_readings_id_location_fkey FOREIGN KEY (id_location) REFERENCES public.locations(id_location),
  CONSTRAINT inventory_readings_id_user_fkey FOREIGN KEY (id_user) REFERENCES public.users(id_user)
);