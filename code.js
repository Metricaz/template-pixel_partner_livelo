// Required libraries
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
const makeString = require('makeString');

// Configurations and Utilities
const referrer  = getReferrerUrl(undefined);
const page_url = getUrl();
const timestamp = getTimestamp();
const gtag = createArgumentsQueue('gtag', 'dataLayer');
const urlObject = parseUrl(page_url); 
const search = urlObject.searchParams;

// Read fields for GA4 pixel data collection, User, and E-commerce
const measurementId = validValue(data.measurementId); 
const eventName = validValue(data.eventName);
const user_id = validValue(data.campo_user_id);
const partner = validValue(data.campo_partner);
const hasEcommGA4 = makeString(data.haveEcommerceGa4);

// logToConsole(search.teste);

if(data.removeStorage === 'true'){
  localStorage.removeItem('gtm_livelo_data');
}

// E-commerce data collection, supporting both GA4 and custom formats
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

// logToConsole('adjusted ecommerce items');

// Validation function to prevent wrong values
function validValue(v) {
  if (v === undefined || v === null || v === '') return 'undefined';
  return makeString(v);
}

// Function to validate the url livelo_origem
function isInvalidLiveloId(id) {
  if (id === undefined || id === null) return true;
  const cleanId = makeString(id).trim().toLowerCase();
  
  // Explicit validation
  if (cleanId === ''  || 
      cleanId === 'null' || 
      cleanId === 'undefined' || 
      cleanId === '[object object]' || 
      cleanId === 'false' || 
      cleanId === 'nan' ||
      cleanId === "''" ||   
      cleanId === '""') {
    return true;
  }
  return false;
}

let storedDataRaw = localStorage.getItem('gtm_livelo_data');
let storedData = storedDataRaw ? JSON.parse(storedDataRaw) : null;

// Management of livelo_id (URL Priority > LocalStorage) with expiration control
const urlLiveloOrigem = search && typeof search.livelo_origem !== 'undefined' ? search.livelo_origem : null;

if (urlLiveloOrigem !== null) {
  if (isInvalidLiveloId(urlLiveloOrigem)) {
    localStorage.removeItem('gtm_livelo_data');
    storedData = null;
    // logToConsole('Invalid livelo_origem parameter detected in URL. Clearing history.');
  } else {
    storedData = {
      id: validValue(urlLiveloOrigem),
      expiry: timestamp + (30 * 60 * 1000), // 30 minutes
      lastEventName: eventName,
      user_id: storedData && storedData.user_id ? storedData.user_id : user_id,
      partner: storedData && storedData.partner ? storedData.partner : partner, // Preserve partner if it exists
      measurementId: storedData && storedData.measurementId ? storedData.measurementId : measurementId, // Preserve measurementId if it exists
      gaData: storedData && storedData.gaData ? storedData.gaData : undefined // Preserve GA data if it exists
    };
    localStorage.setItem('gtm_livelo_data', JSON.stringify(storedData));
    // logToConsole('Livelo ID set from URL and storage object created.');
  }
} else {
  // logToConsole('No livelo_origem found in URL. Checking localStorage for existing Livelo ID.');
}

// Validation of livelo ID to ensure we have a valid value before proceeding
storedDataRaw = localStorage.getItem('gtm_livelo_data');
storedData = storedDataRaw ? JSON.parse(storedDataRaw) : null;

const currentTime = timestamp;

if (storedData && storedData.id && storedData.expiry) {
  if (storedData.expiry < currentTime) {
    // Expired, remove from storage
    localStorage.removeItem('gtm_livelo_data');
    storedData = null; // Treat as not found
    // logToConsole('Livelo data expired. Removed from storage.');
  } else {
    // logToConsole('Livelo data found and is still valid.');
    // If it's a configuration event, renew the expiration
    if (eventName === 'configuration') {
      storedData.expiry = currentTime + (30 * 60 * 1000);
      localStorage.setItem('gtm_livelo_data', JSON.stringify(storedData));
      // logToConsole('Livelo expiry renewed for configuration event.');
    }
  }
} 

const livelo_id = validValue(storedData ? storedData.id : undefined); 
if (!livelo_id || livelo_id === 'undefined'){
  // logToConsole('Livelo ID not found or expired. Pixel will not be sent.');
   data.gtmOnFailure();
  return; // Stop script execution if livelo_id is not valid
}

const fields = ['client_id', 'session_id', 'session_number'];
let gaData = {};
let gtagGet = () => {
  gtag('get', measurementId, fields[0], val => {
    gaData[fields[0]] = val;
    // logToConsole('gtag get for', fields[0], ':', val);
    fields.shift();
    if (fields.length) {
      gtagGet();
    }else{
      storedData.gaData = gaData;
      localStorage.setItem('gtm_livelo_data', JSON.stringify(storedData));
      // logToConsole('All GA4 data collected:', gaData);
    }
  });
};

if (eventName === 'configuration') {
  
  if(measurementId && measurementId !== 'undefined' && storedData.gaData === undefined){
    gtagGet();
  }
  
  // logToConsole('Event is config, pixel will not be sent.');
  data.gtmOnSuccess();
  return; // Stop script execution for config events
}else{
 
  // logToConsole('All GA4 data collected:', storedData);

  // Construction of the parameter object for the pixel, including GA4 and e-commerce data when applicable
  const params = {
      event: eventName,
      source: validValue(storedData && storedData.partner ? storedData.partner : partner),
      partner: validValue(storedData && storedData.partner ? storedData.partner : partner),
      page_url: page_url,
      livelo_id: livelo_id,
      timestamp: validValue(timestamp),
      user_id: validValue(storedData && storedData.user_id ? storedData.user_id : user_id),
      ga_client_id: validValue(storedData && storedData.gaData && storedData.gaData.client_id ? storedData.gaData.client_id : undefined ),
      ga_session_id: validValue(storedData && storedData.gaData && storedData.gaData.session_id ? storedData.gaData.session_id : undefined ),
      ga_session_number: validValue(storedData && storedData.gaData && storedData.gaData.session_number ? storedData.gaData.session_number : undefined )
    };

  // Conditional addition of e-commerce data
  const isEcomEvent = ['purchase', 'add_to_cart', 'begin_checkout', 'view_item'].indexOf(eventName) > -1;
  if (isEcomEvent) {
    params.hasEcommGA4 = hasEcommGA4;
    params.items = items;
  }
  if (eventName === 'purchase') {
    params.transaction_id = transaction_id;
    params.value = value;
  }

  // Query String Construction
  const queryParts = [], mandatory = ['event', 'source', 'partner', 'page_url', 'livelo_id', 'timestamp', 'hasEcommGA4'];
  for (const k in params) {
    if (mandatory.indexOf(k) === -1 && params[k] === 'undefined') continue;
    queryParts.push(encodeUriComponent(k) + '=' + encodeUriComponent(params[k]));
  }

  // Pixel Dispatch
  const url = 'https://partners.livelo.com.br/collect?' + queryParts.join('&');
  // logToConsole('Pixel Livelo URL:', url);
  sendPixel(url, data.gtmOnSuccess(), data.gtmOnFailure());
}