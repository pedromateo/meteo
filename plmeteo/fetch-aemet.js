const fs = require('fs');
const path = require('path');
const AemetService = require('./aemetService.js');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, maxRetries = 5, initialDelayMs = 30000) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.status === 429 && attempt <= maxRetries) {
                const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
                console.warn(`HTTP 429 (Demasiadas peticiones). Esperando ${delayMs / 1000}s antes de reintentar (intento ${attempt} de ${maxRetries})...`);
                await sleep(delayMs);
                continue;
            }
            return res;
        } catch (err) {
            if (attempt <= maxRetries) {
                const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
                console.warn(`Error de conexión (${err.message}). Esperando ${delayMs / 1000}s antes de reintentar (intento ${attempt} de ${maxRetries})...`);
                await sleep(delayMs);
                continue;
            }
            throw err;
        }
    }
}

const TARGET_MUNICIPIOS = [
    { id: '30033', name: 'Puerto Lumbreras', isDefault: true }
];

async function fetchAemetFromXml(municipio = '30030') {
    const xmlUrl = `https://www.aemet.es/xml/municipios_h/localidad_h_${municipio}.xml`;
    console.log(`Descargando datos oficiales de AEMET desde XML de contingencia para ${municipio}: ${xmlUrl}...`);
    
    const maxRetries = 3;
    const initialDelayMs = 5000;
    const res = await fetchWithRetry(xmlUrl, {}, maxRetries, initialDelayMs);
    if (!res.ok) throw new Error(`HTTP Error ${res.status} al descargar XML de AEMET para ${municipio}`);

    const arrayBuffer = await res.arrayBuffer();
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('iso-8859-15') : null;
    const xmlText = decoder ? decoder.decode(arrayBuffer) : Buffer.from(arrayBuffer).toString('latin1');

    const forecastData = AemetService.parseAemetXml(xmlText);
    return forecastData;
}

async function fetchAemetForMunicipio(municipioId, apiKey) {
    let forecastData = null;
    
    if (!apiKey) {
        console.warn(`Aviso: Variable de entorno AEMET_API_KEY no encontrada. Usando XML de AEMET directamente como fallback para ${municipioId}...`);
        forecastData = await fetchAemetFromXml(municipioId);
    } else {
        try {
            console.log(`Solicitando URL de datos a AEMET para municipio ${municipioId}...`);
            const metadataUrl = `https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/horaria/${municipioId}/?api_key=${apiKey}`;
            
            const maxRetries = 5;
            const initialDelayMs = 15000;

            let metaData;
            for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
                const metaRes = await fetchWithRetry(metadataUrl, { headers: { 'Accept': 'application/json' } }, maxRetries - attempt + 1, initialDelayMs * Math.pow(2, attempt - 1));
                if (!metaRes.ok) throw new Error(`HTTP Error ${metaRes.status} al pedir metadatos de ${municipioId}`);
                
                metaData = await metaRes.json();
                if (metaData.estado === 429 && attempt <= maxRetries) {
                    const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
                    console.warn(`AEMET devolvió estado 429 para ${municipioId}: ${metaData.descripcion}. Esperando ${delayMs / 1000}s antes de reintentar (intento ${attempt} de ${maxRetries})...`);
                    await sleep(delayMs);
                    continue;
                }
                break;
            }

            if (metaData.estado !== 200) throw new Error(`AEMET Error para ${municipioId}: ${metaData.descripcion}`);
            
            const dataUrl = metaData.datos;
            console.log(`Descargando JSON de pronóstico real para municipio ${municipioId}...`);
            
            const dataRes = await fetchWithRetry(dataUrl, {}, maxRetries, initialDelayMs);
            if (!dataRes.ok) throw new Error(`HTTP Error en descarga de datos ${dataRes.status} para ${municipioId}`);
            
            forecastData = await dataRes.json();
        } catch (apiErr) {
            console.warn(`⚠️ Error al obtener datos de AEMET OpenData API para ${municipioId} (${apiErr.message}). Activando fallback mediante XML oficial...`);
            forecastData = await fetchAemetFromXml(municipioId);
        }
    }
    return forecastData;
}

function saveForecastFiles(forecastData, municipioConfig) {
    const { id, isDefault } = municipioConfig;

    // Guardar fecha y hora exacta de creación del fichero
    if (Array.isArray(forecastData) && forecastData.length > 0) {
        forecastData[0].ficheroCreado = new Date().toISOString();
    }

    const forecastsDir = path.join(__dirname, 'forecasts');
    if (!fs.existsSync(forecastsDir)) {
        fs.mkdirSync(forecastsDir, { recursive: true });
    }

    const { filename, slot } = getMadridSlot();

    // 1. Archivo rotativo específico del municipio
    const muniSlotFile = `forecast_${id}_${slot}.json`;
    fs.writeFileSync(path.join(forecastsDir, muniSlotFile), JSON.stringify(forecastData, null, 2));
    console.log(`Pronóstico para ${id} guardado exitosamente en forecasts/${muniSlotFile}`);

    // 2. Archivo directo del municipio
    const muniLegacyFile = path.join(__dirname, `forecast_${id}.json`);
    fs.writeFileSync(muniLegacyFile, JSON.stringify(forecastData, null, 2));
    console.log(`Copia para ${id} guardada en forecast_${id}.json`);

    // 3. Si es el municipio por defecto (Murcia), mantener los ficheros tradicionales de MurMeteo
    if (isDefault) {
        const slotPath = path.join(forecastsDir, filename);
        fs.writeFileSync(slotPath, JSON.stringify(forecastData, null, 2));
        console.log(`Pronóstico principal guardado exitosamente en forecasts/${filename}`);

        const legacyPath = path.join(__dirname, 'forecast.json');
        fs.writeFileSync(legacyPath, JSON.stringify(forecastData, null, 2));
        console.log('Copia principal guardada en forecast.json');
    }

    // 4. Purgar pronósticos antiguos para este municipio
    pruneOldForecasts(forecastsDir, 5, new RegExp(`^forecast_${id}_\\d{8}_(am|pm)\\.json$`));
    if (isDefault) {
        pruneOldForecasts(forecastsDir, 5, /^forecast_\d{8}_(am|pm)\.json$/);
    }
}

async function fetchAemet(targetMunicipios = TARGET_MUNICIPIOS) {
    const apiKey = process.env.AEMET_API_KEY;
    const results = {};

    for (let i = 0; i < targetMunicipios.length; i++) {
        const muni = targetMunicipios[i];
        console.log(`=== Procesando pronóstico para ${muni.name} (${muni.id}) ===`);
        try {
            const data = await fetchAemetForMunicipio(muni.id, apiKey);
            saveForecastFiles(data, muni);
            results[muni.id] = data;
        } catch (err) {
            console.error(`Error procesando ${muni.name} (${muni.id}):`, err);
            throw err;
        }

        // Breve pausa entre peticiones sucesivas para evitar sobrecarga o límites de la API
        if (i < targetMunicipios.length - 1) {
            await sleep(2000);
        }
    }
    return results;
}

function getMadridSlot(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
    }).formatToParts(date);
    
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    const rawHour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const hour = rawHour === 24 ? 0 : rawHour;
    const period = hour < 12 ? 'am' : 'pm';
    
    return {
        slot: `${y}${m}${d}_${period}`,
        filename: `forecast_${y}${m}${d}_${period}.json`
    };
}

function pruneOldForecasts(dirPath, maxFiles = 5, pattern = /^forecast_\d{8}_(am|pm)\.json$/) {
    if (!fs.existsSync(dirPath)) return;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const files = fs.readdirSync(dirPath)
        .filter(f => regex.test(f))
        .sort()
        .reverse();
        
    if (files.length > maxFiles) {
        const toDelete = files.slice(maxFiles);
        for (const file of toDelete) {
            fs.unlinkSync(path.join(dirPath, file));
            console.log(`Eliminado pronóstico antiguo: ${file}`);
        }
    }
}

if (require.main === module) {
    fetchAemet().catch(e => {
        console.error('El script de AEMET falló:', e);
        process.exit(1);
    });
}

module.exports = {
    TARGET_MUNICIPIOS,
    fetchAemet,
    fetchAemetFromXml,
    fetchAemetForMunicipio,
    saveForecastFiles,
    getMadridSlot,
    pruneOldForecasts
};
