/**
 * An API for getting random quotes from random pages on the English Wikiquote site.
 *
 * RandomWikiquote.getRandomQuote() returns a promise that will resolve when a valid
 * quote is found and reject if the RETRY_LIMIT is exceeded. A resolved promise returns
 * an object with the keys "title" and "quote".
 *
 * Title can be many things. It can be a person who said the quote, but it can also be
 * the name of the show, movie, game, or book the quote is from.
 */
const RandomWikiquote = {};

const BASE_URL = "https://en.wikiquote.org/w/api.php?origin=*&format=json";
const RETRY_LIMIT = 7;
const ELEMENTS_TO_KEEP = [ // These elements could contain the quote or parts of it.
  'A', 'B', 'I', 'STRONG', 'EM', 'MARK', 'ABBR', 'SMALL',
  'DEL', 'INS', 'SUB', 'SUP', 'PRE', 'CODE', 'DFN', 'SAMP'
];

let minLength = 20;
let maxLength = 300;
let numericLimit = 0.1; // Some 'quotes' are just dates and times. Those are filtered out.

RandomWikiquote.setMinLength = (min) => minLength = min;
RandomWikiquote.setMaxLength = (max) => maxLength = max;
RandomWikiquote.setNumericLimit = (percentage) => numericLimit = percentage;

const isQuoteValid = quote => {
  if (!quote)
    return false;

  const length = quote.length;
  const digitPercentage = (quote.match(/\d/g) || []).length / length;

  if (length < minLength || length > maxLength || digitPercentage > numericLimit)
    return false;
  return true;
};

const ajaxGet = (url) => {
  return new Promise((resolve, reject) => {
    const xmlhttp = new XMLHttpRequest();

    xmlhttp.onreadystatechange = () => {
      const status = xmlhttp.status;

      if (xmlhttp.readyState != 4 || status == 0)
        return;
      else if (status != 200) {
        reject("Invalid Response: " + status);
        return;
      }

      try {
        const data = JSON.parse(xmlhttp.responseText);
        resolve(data);
      }
      catch (error) {
        reject(error);
      }
    };

    xmlhttp.open("GET", url, true);
    xmlhttp.send();
  });
}

/**
 * Gets all quotes for a given section.
 * Returns the title in case there is a redirect.
 */
const getQuotesForSection = async (pageId, sectionIndex) => {
  const url = BASE_URL + "&action=parse&noimages=&pageid=" + pageId + "&section=" + sectionIndex;
  let data = null;

  try {
    data = await ajaxGet(url);
  }
  catch (error) {
    return Promise.reject(error);
  }

  if (!data.parse) // Some pages have no valid sections.
    return Promise.reject("Section is not valid.");

  const parsedQuotes = []
  const quotes = data.parse.text["*"];
  const parser = new DOMParser();
  const html = parser.parseFromString(quotes, 'text/html');
  const allQuotes = html.querySelectorAll('div > ul > li');

  for (let quote of allQuotes) {
    // Must be array instead of live collection in case we remove multiple elements.
    let children = Array.from(quote.children);

    // Replace unwanted elements with spaces to avoid running words together.
    for (let child of children)
      if (!ELEMENTS_TO_KEEP.includes(child.tagName))
        quote.replaceChild(document.createTextNode(" "), child);

    let plainQuote = quote.innerText;
    // Turn all consecutive whitespaces into single spaces.
    plainQuote = plainQuote.replace(/\s\s+/gmi, ' ');
    plainQuote = plainQuote.trim();

    if (isQuoteValid(plainQuote))
      parsedQuotes.push(plainQuote);
  }

  if (parsedQuotes.length == 0)
    return Promise.reject("Section has no valid quote.");

  return { titles: data.parse.title, quotes: parsedQuotes };
}

/**
* Get the sections for a given page to make parsing easier.
* Returns an array of all "1.x" sections as these usually contain the quotes.
* If no 1.x sections exists, returns section 1.
* Returns the title in case there is a redirect.
*/
const getSectionsForPage = async (pageId) => {
  const url = BASE_URL + "&action=parse&prop=sections&pageid=" + pageId;
  let data = null;

  try {
    data = await ajaxGet(url);
  }
  catch (error) {
    return Promise.reject(error);
  }

  const sectionArray = [];
  const sections = data.parse.sections;

  for (let s in sections) {
    let splitNum = sections[s].number.split('.');
    if (splitNum.length > 1 && splitNum[0] === "1") {
      sectionArray.push(sections[s].index);
    }
  }

  if (sectionArray.length === 0)
    sectionArray.push("1"); // Use section 1 if there are no "1.x" sections

  return { pageId: pageId, titles: data.parse.title, sections: sectionArray };
}

/**
 * Gets a random page id from the main namespace.
 */
const getRandomPage = async () => {
  const url = BASE_URL + "&action=query&list=random&rnnamespace=0&rnlimit=1";
  let data = null;

  try {
    data = await ajaxGet(url);
  }
  catch (error) {
    return Promise.reject(error);
  }

  const id = data.query.random[0].id;
  if (!id) return Promise.reject("Invalid random page id.");
  return id;
}

/**
 * Gets a random quote from a random page in the main namespace.
 * Keeps trying for a valid quote until RETRY_LIMIT is reached.
 */
const getRandomQuote = () => {
  return new Promise((resolve, reject) => {
    let numRetry = 0;

    const randomNum = max => Math.floor(Math.random() * max);
    const randomSection = sections => sections[randomNum(sections.length)];
    const randomQuote = quotes => quotes.quotes[randomNum(quotes.quotes.length)];
    const chooseQuote = quotes => ({ title: quotes.titles, quote: randomQuote(quotes) });

    const checkRetry = (reason) => {
      console.log(reason + " Retrying...");
      numRetry++;

      if (numRetry >= RETRY_LIMIT)
        reject("Retry limit reached");
      else
        mainSequence();
    }

    var mainSequence = () => {
      getRandomPage()
        .then(pageId => getSectionsForPage(pageId))
        .then(data => getQuotesForSection(data.pageId, randomSection(data.sections)))
        .then(quotes => chooseQuote(quotes))
        .then(theQuote => resolve(theQuote))
        .catch(reason => checkRetry(reason));
    };

    mainSequence();
  });
};

RandomWikiquote.getRandomQuote = getRandomQuote;
export default RandomWikiquote;