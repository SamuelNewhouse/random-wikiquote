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

const WikiquoteApi = (() => {
  var wqa = {};

  const API_URL = "https://en.wikiquote.org/w/api.php?origin=*&format=json";
  const retryLimit = 10;

  var minLength = 20;
  var maxLength = 300;
  var numericLimit = 0.1;

  wqa.setMinLength = (min) => minLength = min;
  wqa.setMaxLength = (max) => maxLength = max;
  wqa.setNumericLimit = (percentage) => numericLimit = percentage;

  /**
   * Get all quotes for a given section.  Most sections will be of the format:
   * <h3> title </h3>
   * <ul>
   *   <li>
   *     Quote text
   *     <ul>
   *       <li> additional info on the quote </li>
   *     </ul>
   *   </li>
   * <ul>
   * <ul> next quote etc... </ul>
   *
   * Returns the titles that were used in case there is a redirect.
   */
  wqa.getQuotesForSection = (pageId, sectionIndex) => {
    return new Promise((resolve, reject) => {
      $.ajax({
        url: API_URL,
        dataType: "jsonp",
        data: {
          format: "json",
          action: "parse",
          noimages: "",
          pageid: pageId,
          section: sectionIndex
        },

        success: result => {
          if (!result.parse) // Some pages have no valid sections.
            return reject("Page has no valid section");

          const childrenToKeep = ['B', 'STRONG', 'I', 'EM,', 'MARK', 'SMALL', 'DEL', 'INS', 'SUB', 'SUP', 'A'];

          var quotes = result.parse.text["*"];

          const parser = new DOMParser();
          const html = parser.parseFromString(quotes, 'text/html');
          const allQuotes = html.querySelectorAll('div > ul > li');

          let quoteArray = []

          for (let quote of allQuotes) {
            // quote.children is a live collection. Convert to array.
            let children = Array.from(quote.children);

            // replace unwanted elements with a space.
            for (let child of children)
              if (!childrenToKeep.includes(child.tagName))
                quote.replaceChild(document.createTextNode(" "), child);

            quoteArray.push(quote.outerText);
          }

          resolve({ titles: result.parse.title, quotes: quoteArray });
        },

        error: () => reject("Error getting quotes")
      });
    });
  };

  // wqa.getQuotesForSection = async (pageId, sectionIndex) => {
  //   const url = API_URL + "&action=parse&noimages&pageId=" + pageId + "&section=" +sectionIndex;

  // }

  /**
  * Get the sections for a given page.
  * This makes parsing for quotes more manageable.
  * Returns an array of all "1.x" sections as these usually contain the quotes.
  * If no 1.x sections exists, returns section 1. Returns the titles that were used
  * in case there is a redirect.
  */
  wqa.getSectionsForPage = async (pageId) => {
    const url = API_URL + "&action=parse&prop=sections&pageid=" + pageId;

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
      // Use section 1 if there are no "1.x" sections
      if (sectionArray.length === 0) {
        sectionArray.push("1");
      }
      return { pageId: pageId, titles: data.parse.title, sections: sectionArray };
    }
    catch (error) {
      throw new Error(error);
    }
  }

  /**
   * Gets a random page id from the main namespace.
   */
  wqa.getRandomPage = async () => {
    const url = API_URL + "&action=query&list=random&rnnamespace=0&rnlimit=1";

    try {
      const data = await ajaxGet(url);
      const id = data.query.random[0].id;
      if (!id) throw new Error("Invalid random page id");
      return id;
    }
    catch (error) {
      throw new Error(error);
    }
  }

  /**
   * Gets a random quote from a random title in the main namespace
   * Quotes will either not be found or rejected for various reasons
   * Keeps trying for a valid quote until retryLimit is reached
   */
  wqa.getRandomQuote = () => {
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

        if (numRetry >= retryLimit)
          reject("Retry limit reached");
        else
          mainSequence();
      }

      var mainSequence = () => {
        wqa.getRandomPage()
          .then(pageId => wqa.getSectionsForPage(pageId))
          .then(data => wqa.getQuotesForSection(data.pageId, randomSection(data.sections)))
          .then(quotes => chooseQuote(quotes))
          .then(quote => checkQuote(quote))
          .then(theQuote => resolve(theQuote))
          .catch(reason => checkRetry(reason));
      };

      mainSequence();
    });
  };

  return wqa;
})();

export default WikiquoteApi;