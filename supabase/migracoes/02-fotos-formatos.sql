-- MIGRAÇÃO 02 — o bucket 'pratos' passa a aceitar também JPEG e PNG (antes: só WebP).
-- Só altera a configuração do bucket. Não mexe em policies, nem em arquivos já enviados; o bucket continua com leitura pública, como antes.
-- O limite de 300 KB é mantido.
update storage.buckets
   set allowed_mime_types = array['image/webp','image/jpeg','image/png'], file_size_limit = 307200
 where id = 'pratos';
