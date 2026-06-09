//required libraries
const getUrl = require('getUrl');
const sendPixel = require('sendPixel');
const encodeUriComponent = require('encodeUriComponent');
const logToConsole = require('logToConsole');
const localStorage = require('localStorage');
const getTimestamp = require('getTimestamp');
const createArgumentsQueue = require('createArgumentsQueue');
const copyFromDataLayer = require('copyFromDataLayer');
const JSON = require('JSON');
const getQueryParameters = require('getQueryParameters');
const queryPermission = require('queryPermission');
const getReferrerUrl = require('getReferrerUrl');
const parseUrl = require('parseUrl');

// Configurações e Utilitários
const referrer  = getReferrerUrl(undefined);
const page_url = getUrl();
const timestamp = getTimestamp();
const gtag = createArgumentsQueue('gtag', 'dataLayer');

const urlObject = parseUrl(page_url); // Para manipulação de query params
const search = urlObject.searchParams;

// Ler campos para coleta de dados pixel GA4, User e E-commerce
const measurementId = validValue(data.measurementId); //GA4 Measurement ID para ler client_id
const eventName = validValue(data.eventName);
const user_id = validValue(data.campo_user_id);
const partner = validValue(data.campo_partner);
const hasEcommGA4 = data.haveEcommerceGa4.toString().trim();

//logToConsole(search.teste);

// Coleta de dados de e-commerce, com suporte para GA4 e formato personalizado
let items, transaction_id, value;
if (hasEcommGA4 === 'true') {
  const dlItems = copyFromDataLayer('ecommerce.items');
  items = dlItems ? JSON.stringify(dlItems) : 'undefined';
  transaction_id = validValue(copyFromDataLayer('ecommerce.transaction_id'));
  value = validValue(copyFromDataLayer('ecommerce.value'));
} else {
  const rawItems = data.campo_items;
  items = (typeof rawItems === 'object' && rawItems !== null) ? JSON.stringify(rawItems) : validValue(rawItems);
  transaction_id = validValue(data.campo_transaction_id);
  value = validValue(data.campo_value);
}

//logToConsole('ajustou items ecommerce');

// Função de validação para evitar valores indesejados
function validValue(v) {
  if (v === undefined || v === null || v === '') return 'undefined';
  return v.toString().trim();
}

// Gerenciamento do livelo_id (URL Priority > LocalStorage) com controle de expiração
if (search && typeof(search.livelo_origem) !== 'undefined' && search.livelo_origem.length > 0) {
  const liveloData = {
    id: validValue(search.livelo_origem),
    expiry: timestamp + (30 * 60 * 1000)
  };
  localStorage.setItem('gtm_livelo_data', JSON.stringify(liveloData));
  logToConsole('Livelo ID set from URL and storage object created.');
} else {
  logToConsole('No livelo_origem found in URL. Checking localStorage for existing Livelo ID.');
}

// Validação de livelo ID para garantir que temos um valor válido antes de prosseguir
const storedDataRaw = localStorage.getItem('gtm_livelo_data');
let storedData = storedDataRaw ? JSON.parse(storedDataRaw) : null;
const currentTime = timestamp;

if (storedData && storedData.id && storedData.expiry) {
  if (storedData.expiry < currentTime) {
    // Expired, remove from storage
    localStorage.removeItem('gtm_livelo_data');
    storedData = null; // Treat as not found
    logToConsole('Livelo data expired. Removed from storage.');
  } else {
    logToConsole('Livelo data found and is still valid.');
    // If it's a page_view event, renew the expiration
    if (eventName === 'page_view') {
      storedData.expiry = currentTime + (30 * 60 * 1000);
      localStorage.setItem('gtm_livelo_data', JSON.stringify(storedData));
      logToConsole('Livelo expiry renewed for page_view event.');
    }
  }
} else {
  logToConsole('Livelo data not found in localStorage.');
}

const livelo_id = validValue(storedData ? storedData.id : undefined); 
if (!livelo_id || livelo_id === 'undefined'){
  logToConsole('Livelo ID não encontrado ou expirado. Pixel não será enviado.');
   data.gtmOnFailure();
  return; // Stop script execution if livelo_id is not valid
}

// Recursion to get each field in turn and finally push into dataLayer
let gaData = {}, dataObj = {};
const fields = ['client_id', 'session_id', 'session_number'];
const gtagGet = () => {
  if (!measurementId) return;
  gtag('get', data.measurementId, fields[0], val => {
    dataObj[fields[0]] = val;
    fields.shift();
    if (fields.length) {
      gtagGet();
    } else {
      gaData = dataObj;
      data.gtmOnSuccess();
    }
  });
}; gtagGet();


// 3. Construção do Pixel URL e Envio
const fireLiveloPixel = () => {

  // Construção do objeto de parâmetros para o pixel, incluindo os dados do GA4 e e-commerce quando aplicável
  const params = {
      event: eventName,
      source: partner,
      partner: partner,
      page_url: page_url,
      livelo_id: livelo_id,
      timestamp: timestamp.toString().trim(),
      user_id: user_id,
      ga_client_id: validValue(gaData.client_id),
      ga_session_id: validValue(gaData.session_id),
      ga_session_number: validValue(gaData.session_number)
    };

  // Adição condicional de e-commerce
  const isEcomEvent = ['purchase', 'add_to_cart', 'begin_checkout', 'view_item'].indexOf(eventName) > -1;
  if (isEcomEvent) {
    params.hasEcommGA4 = hasEcommGA4;
    params.items = items;
  }
  if (eventName === 'purchase') {
    params.transaction_id = transaction_id;
    params.value = value;
  }

  // 4. Construção da Query String
  const queryParts = [], mandatory = ['event', 'source', 'partner', 'page_url', 'livelo_id', 'timestamp', 'hasEcommGA4'];
  for (const k in params) {
    if (mandatory.indexOf(k) === -1 && params[k] === 'undefined') continue;
    queryParts.push(encodeUriComponent(k) + '=' + encodeUriComponent(params[k]));
  }

  // 5. Envio do Pixel
  const url = 'https://partners.livelo.com.br/collect?' + queryParts.join('&');
  logToConsole('Pixel Livelo URL:', url);
  sendPixel(url, data.gtmOnSuccess, data.gtmOnFailure);
}; fireLiveloPixel();



// /// /// UNIT TESTS

//SETUP
const mockData = {
  campo_partner: 'mtz-loja-teste',
  eventName:'page_view',
  haveEcommerceGa4: false
};

//TEST 1
let url = 'https://www.example.com/path/?teste=gustavo&teste2=teste2';
mock('getUrl', component => {
      return url;
    });
const test = runCode(mockData);

// Verify that the tag finished successfully.
assertApi('gtmOnFailure').wasCalled();


//TEST 2
let url = 'https://www.example.com/path/?livelo_origem=1231231231231231.123123123.12';
mock('getUrl', component => {
      return url;
    });
const test = runCode(mockData);

// Verify that the tag finished successfully.
assertApi('gtmOnSuccess').wasCalled();