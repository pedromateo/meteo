# 🌤️ Meteo Hub

Repositorio monorepo con aplicaciones meteorológicas y marítimas interactivas, ligeras y con soporte de funcionamiento sin conexión (PWAs).

Desplegado en producción en **GitHub Pages**: [https://pedromateo.github.io/meteo/](https://pedromateo.github.io/meteo/)

---

## 📱 Proyectos Incluidos

### 1. 🌦️ MurMeteo (`/murmeteo/`)
Aplicación web progresiva orientada a la información meteorológica oficial del municipio de Murcia.
* **Fuente de Datos**: API OpenData de AEMET (Agencia Estatal de Meteorología de España).
* **Características**:
  * Pronóstico horario y diario detallado (temperatura, sensación térmica, viento, lluvia, índice UV).
  * Radar oficial de precipitaciones de AEMET y avisos meteorológicos en tiempo real.
  * Actualización periódica en segundo plano mediante GitHub Actions (`update-weather.yml`).
  * Service Worker con soporte offline y caché inteligente.
  * Suite de pruebas automatizadas con Playwright (`npm test`).

### 2. ☀️ ElParte (`/elparte/`)
Previsión meteorológica horaria a 7 días con un diseño visual minimalista de navegación rápida.
* **Fuente de Datos**: Open-Meteo API (sin claves necesarias).
* **Características**:
  * PWA *client-only* ultrarrápida.
  * Línea de tiempo horaria interactiva con iconos claros y gradientes de temperatura.
  * Almacenamiento local para arranque instantáneo.

### 3. 🏖️ PozoMeteo (`/pozometeo/`)
Evaluador en tiempo real de las condiciones marítimas y estado del baño en la playa de **Pozo del Esparto** (Cuevas del Almanzora, Almería).
* **Fuente de Datos**: Open-Meteo Marine API & Weather API.
* **Características**:
  * Recomendación inteligente de bandera de playa (Verde / Amarilla / Roja) calculada por un motor de reglas heurísticas (`beach_rules.json`).
  * Altura, periodo y dirección del oleaje, y ráfagas de viento.
  * Cache híbrida con estrategia *Stale-While-Revalidate* y disponibilidad offline total.
  * Suite de tests de integración propios (`node test.js`).

---

## 📂 Estructura del Repositorio

```text
meteo/
├── .github/
│   └── workflows/
│       ├── deploy.yml            # Compilación y despliegue a GitHub Pages
│       └── update-weather.yml    # Actualización periódica de datos AEMET (cron)
├── index.html                    # Portal Meteo Hub raíz
├── murmeteo/                     # Código y recursos de MurMeteo
│   ├── fetch-aemet.js            # Extractor de predicciones AEMET
│   ├── forecasts/                # Histórico de pronósticos AEMET
│   ├── forecast.json             # Último pronóstico activo
│   └── tests/                    # Tests E2E con Playwright
├── elparte/                      # Código y recursos de ElParte
├── pozometeo/                    # Código y recursos de PozoMeteo
│   ├── beach_rules.json          # Reglas de oleaje y banderas
│   └── test.js                   # Tests automáticos del motor
├── .gitignore
└── README.md
```

---

## 🛠️ Desarrollo Local

Puedes clonar y ejecutar el entorno localmente usando cualquier servidor estático:

```bash
# 1. Clonar el repositorio
git clone git@github.com:pedromateo/meteo.git
cd meteo

# 2. Servir el portal raíz y las tres aplicaciones
npx serve .
# o con python:
python3 -m http.server 8080
```

Acceso en el navegador:
* Portal Hub: `http://localhost:8080/`
* MurMeteo: `http://localhost:8080/murmeteo/`
* ElParte: `http://localhost:8080/elparte/`
* PozoMeteo: `http://localhost:8080/pozometeo/`

---

## 🧪 Pruebas Automatizadas

### MurMeteo
```bash
cd murmeteo
npm install
npm test
```

### PozoMeteo
```bash
cd pozometeo
node test.js
```

---

## 🔄 Flujos de Integración y Despliegue (CI/CD)

1. **`Update Weather Forecast` (`.github/workflows/update-weather.yml`)**:
   * Se ejecuta automáticamente cada 20 minutos (minutos `7, 27, 47` de cada hora).
   * Utiliza el secreto `AEMET_API_KEY` para consultar la API de AEMET OpenData.
   * Guarda los datos en `forecasts/` y `forecast.json` y realiza un commit/push automático a `main`.

2. **`Deploy Meteo Hub & Apps` (`.github/workflows/deploy.yml`)**:
   * Se dispara tras cada `push` a la rama `main` o automáticamente al completarse con éxito `Update Weather Forecast`.
   * Ejecuta las suites de tests automáticos de MurMeteo y PozoMeteo.
   * Empaqueta el portal raíz y los 3 proyectos en la carpeta `dist/`.
   * Publica el artefacto directamente en **GitHub Pages**.

---

## 👤 Autor
Desarrollado y mantenido por [Pedro Mateo](https://github.com/pedromateo).
Licencia abierta para fines personales y educativos.
