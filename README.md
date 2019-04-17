# Wikiquote API

An API for getting random quotes from random pages on the English Wikiquote site.

RandomWikiquote.getRandomQuote() returns a promise that will resolve when a valid quote is found and reject if the RETRY_LIMIT is exceeded. A resolved promise returns an  with the keys "title" and "quote".

Title can be many things. It can be a person who said the quote, but it can also be the name of the show, movie, game, book, etc. the quote is from.


See it being used here: https://samuelnewhouse.github.io/quote-machine2/

Originally based on this project: https://github.com/natetyler/wikiquotes-api/