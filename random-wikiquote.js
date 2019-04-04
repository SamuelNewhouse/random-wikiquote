const RandomWikiquote = {};
const BASE_URL = "https://en.wikiquote.org/w/api.php?origin=*&format=json";
const RETRY_LIMIT = 7;

let minLength = 20;
let maxLength = 300;
let numericLimit = 0.1;

RandomWikiquote.setMinLength = (min) => minLength = min;
RandomWikiquote.setMaxLength = (max) => maxLength = max;
RandomWikiquote.setNumericLimit = (percentage) => numericLimit = percentage;

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
 * Get all quotes for a given section.
 * Returns the titles that were used in case there is a redirect.
 */
const getQuotesForSection = async (pageId, sectionIndex) => {
  const url = BASE_URL + "&action=parse&noimages=&pageid=" + pageId + "&section=" + sectionIndex;
  const childrenToKeep = [
    'A', 'B', 'I', 'STRONG', 'EM', 'MARK', 'ABBR', 'SMALL',
    'DEL', 'INS', 'SUB', 'SUP', 'PRE', 'CODE', 'DFN', 'SAMP'
  ];

  try {
    const data = await ajaxGet(url);
    if (!data.parse) // Some pages have no valid sections.
      return Promise.reject("Page has no valid section");

    var quotes = data.parse.text["*"];

    const parser = new DOMParser();
    const html = parser.parseFromString(quotes, 'text/html');
    const allQuotes = html.querySelectorAll('div > ul > li');

    let parsedQuotes = []

    for (let quote of allQuotes) {
      // Must be array instead of live collection in case we remove multiple elements.
      let children = Array.from(quote.children);

      // Replace unwanted elements with spaces to avoid running words together in some cases.
      for (let child of children)
        if (!childrenToKeep.includes(child.tagName))
          quote.replaceChild(document.createTextNode(" "), child);

      parsedQuotes.push(quote.outerText);
    }

    // TODO: Filter out bad quotes to reduce API calls.

    return { titles: data.parse.title, quotes: parsedQuotes };
  }
  catch (error) {
    return Promise.reject(error);
  }
}

/**
* Get the sections for a given page to make parsing easier.
* Returns an array of all "1.x" sections as these usually contain the quotes.
* If no 1.x sections exists, returns section 1.
* Returns the titles that were used in case there is a redirect.
*/
const getSectionsForPage = async (pageId) => {
  const url = BASE_URL + "&action=parse&prop=sections&pageid=" + pageId;

  try {
    const data = await ajaxGet(url);
    const sectionArray = [];
    const sections = data.parse.sections;

    for (let s in sections) {
      let splitNum = sections[s].number.split('.');
      if (splitNum.length > 1 && splitNum[0] === "1") {
        sectionArray.push(sections[s].index);
      }
    }

    if (sectionArray.length === 0) {
      sectionArray.push("1"); // Use section 1 if there are no "1.x" sections
    }
    return { pageId: pageId, titles: data.parse.title, sections: sectionArray };
  }
  catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Gets a random page id from the main namespace.
 */
const getRandomPage = async () => {
  const url = BASE_URL + "&action=query&list=random&rnnamespace=0&rnlimit=1";

  try {
    const data = await ajaxGet(url);
    const id = data.query.random[0].id;
    if (!id) return Promise.reject("Invalid random page id");
    return id;
  }
  catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Gets a random quote from a random title in the main namespace
 * Quotes will either not be found or rejected for various reasons
 * Keeps trying for a valid quote until RETRY_LIMIT is reached
 */
const getRandomQuote = () => {
  return new Promise((resolve, reject) => {
    var numRetry = 0;

    var randomNum = max => Math.floor(Math.random() * max);
    var randomSection = sections => sections[randomNum(sections.length)];
    var randomQuote = quotes => quotes.quotes[randomNum(quotes.quotes.length)];
    var chooseQuote = quotes => ({ title: quotes.titles, quote: randomQuote(quotes) });

    var checkQuote = quote => {
      if (!quote.quote) // Some pages have title and sections but no quotes
        return Promise.reject('No quote found');

      var length = quote.quote.length;
      var digitPercentage = (quote.quote.match(/\d/g) || []).length / length;

      if (length < minLength)
        return Promise.reject("Quote is too short");
      else if (length > maxLength)
        return Promise.reject("Quote is too long");
      else if (digitPercentage > numericLimit)  // Some quotes are just dates and times
        return Promise.reject("Quote is too numeric");
      else
        return quote;
    };

    var checkRetry = (reason) => {
      console.log(reason + ". Retrying...");
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
        .then(quote => checkQuote(quote))
        .then(theQuote => resolve(theQuote))
        .catch(reason => checkRetry(reason));
    };

    mainSequence();
  });
};

RandomWikiquote.getRandomQuote = getRandomQuote;

export default RandomWikiquote;