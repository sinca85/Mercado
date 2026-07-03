# IOL Market Data Lab

Base mínima para conectarse a la API de InvertirOnline, autenticar con OAuth password grant y consultar cotización cruda de un ticker.

## Links útiles

- Landing API IOL: https://www.invertironline.com/api
- Documentación API IOL: https://www.invertironline.com/documentacion-api
- Portal developers: https://developers.invertironline.com/
- Tarifas IOL: https://www.invertironline.com/tarifas

Según la página de tarifas de IOL, el servicio de API es optativo, requiere habilitación previa y está bonificado hasta 25.000 API calls mensuales. Revisá siempre la tarifa vigente en IOL.

## Cómo habilitar credenciales / acceso

1. Entrá a tu cuenta de IOL.
2. Buscá la sección de API / Personalización / Trading Tools.
3. Aceptá los términos y condiciones del servicio de APIs.
4. Probá ingresar al portal de documentación con tu cuenta.

En muchos ejemplos públicos de IOL se usa el mismo usuario y contraseña de la cuenta para obtener token OAuth:

```txt
POST https://api.invertironline.com/token
username=...
password=...
grant_type=password
```

No subas tus credenciales a GitHub. Usá `.env` local o variables de entorno en Vercel.

## Instalación local

```bash
npm install
cp .env.example .env
# editar .env con tus datos
npm run dev
```

Abrí:

```txt
http://localhost:3000
```

## Endpoints propios del lab

### Healthcheck

```bash
curl http://localhost:3000/api/health
```

### Token test

```bash
curl http://localhost:3000/api/token-test
```

### Cotización

```bash
curl "http://localhost:3000/api/quote?market=BCBA&symbol=GGAL"
```

### Panel de opciones

```bash
curl "http://localhost:3000/api/options"
```

Pantalla Ant Design:

```txt
http://localhost:3000/cotizaciones
```

### Cadenas normalizadas de opciones

```bash
curl "http://localhost:3000/api/option-chains?underlying=GGAL&monthCode=AG"
```

### Estrategias web

Landing para crear una estrategia con link propio:

```txt
http://localhost:3000/estrategias
```

Cada estrategia queda disponible por ID:

```txt
http://localhost:3000/estrategias/<id>
```

API:

```bash
curl -X POST "http://localhost:3000/api/strategies" \
  -H "Content-Type: application/json" \
  -d '{"name":"GGAL Agosto","underlying":"GGAL","monthCode":"AG","legs":[]}'
```

La versión local guarda las estrategias en `data/strategies.json`. La interfaz de API está pensada para poder cambiar ese storage por Mongo sin modificar el frontend.

Para opciones, probá el símbolo exacto como aparece en IOL/BYMA. Ejemplo orientativo:

```bash
curl "http://localhost:3000/api/quote?market=BCBA&symbol=GFGCXXXX"
```

## Notas importantes

- Esto NO envía órdenes. Sólo lee data.
- La respuesta se devuelve cruda para ver exactamente qué campos entrega IOL: bid, ask, volumen, fecha, puntas, etc.
- Si el endpoint de cotización cambia, tocá `src/iolClient.js`, función `getQuote`.
- Para capturar spread no uses polling agresivo al principio. Medí primero latencia, límite de llamadas y consistencia de datos.
- El server cachea panel de opciones y cotizaciones para no consumir llamadas de IOL en cada apertura de pantalla.
- Si configurás `MONGO_URI`, el cache queda persistido en Mongo entre reinicios; sin esa variable usa cache en memoria.

## Deploy en Vercel

1. Subí este repo a GitHub.
2. Importalo en Vercel.
3. Agregá variables de entorno:
   - `IOL_USERNAME`
   - `IOL_PASSWORD`
   - `IOL_BASE_URL=https://api.invertironline.com`
   - `MONGO_URI=mongodb://...`
   - `MONGO_DB=iol_market_data_lab`
   - `MARKET_CACHE_INTERVAL_MINUTES=20`
   - `MARKET_CACHE_START_HOUR=11`
   - `MARKET_CACHE_END_HOUR=17`
   - `MARKET_CACHE_TIME_ZONE=America/Argentina/Buenos_Aires`
   - `MARKET_CACHE_UNDERLYINGS=GGAL,YPFD,COME,PAMP,BMA,ALUA,SUPV`
4. Deploy.

Luego probá:

```txt
https://tu-proyecto.vercel.app/api/quote?market=BCBA&symbol=GGAL
```

## Cache de mercado

El cache normal usa `MARKET_CACHE_INTERVAL_MINUTES` como TTL. Dentro de la ventana horaria configurada refresca desde IOL cuando vence; fuera de horario reutiliza el último snapshot disponible. El botón `Actualizar IOL` fuerza refresh manual.
