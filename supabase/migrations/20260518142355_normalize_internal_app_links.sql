UPDATE public.apps
SET internal_link = '/' || btrim(internal_link),
    updated_at = NOW()
WHERE link_type = 'interno'
  AND internal_link IS NOT NULL
  AND btrim(internal_link) <> ''
  AND btrim(internal_link) !~* '^https?://'
  AND left(btrim(internal_link), 1) <> '/';
