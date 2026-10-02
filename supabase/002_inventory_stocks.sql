ALTER TABLE public.stocks
  ADD CONSTRAINT stocks_id_item_fkey FOREIGN KEY (id_item) REFERENCES public.items(id_item),
  ADD CONSTRAINT stocks_id_store_fkey FOREIGN KEY (id_store) REFERENCES public.stores(id_store),
  ADD CONSTRAINT stocks_id_location_fkey FOREIGN KEY (id_location) REFERENCES public.locations(id_location);
