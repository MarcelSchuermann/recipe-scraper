// test.js
const getRecipeData = require('./dist/index').default;

(async () => {
  try {
    // working more or less:
    // const url = 'https://migusto.migros.ch/de/rezepte/golden-milk';
    // const url = 'https://www.brigitte.de/rezepte/anko-12530196.html';
    // const url = 'https://thomassixt.de/rezept/rinderbruehe/';
    // const url = 'https://www.hellofresh.ch/recipes/weisse-chili-sin-carne-64e860e24e40d5c6cb1a57d3';
    // const url = 'https://fooby.ch/de/rezepte/21177/ingwer-shot';
    // const url = 'https://www.bummellang.de/kuerbissuppe-fuer-euer-kleinkind-mit-erweiterung-fuer-erwachsene/';
    // const url = 'https://www.essen-und-trinken.de/rezepte/moehrensuppe-mit-kurkuma-13399762.html';
    // const url = 'https://www.chefkoch.de/rezepte/3100201462870456/Adzukibohnen-Burger.html';
    // const url = 'https://www.bettybossi.ch/de/rezepte/rezept/blaubeer-streuselkuchen-10003439/';
    // const url = 'https://www.paleo360.de/rezepte/fisch-im-ofen/';
    // not working:
    // const url = 'https://www.oetker.ch/rezepte/r/brownies-deluxe'; // important page
    const url = 'https://sallys-blog.de/rezepte/croissant-herzen' // important page
    // const url = 'https://sallys-blog.de/rezepte/lachs-avocado-brottorte';
    // const url = 'https://www.einfachbacken.de/rezepte/blaubeer-kompott-in-nur-2-schritten';
    // const url = 'https://www.spar.ch/rezeptwelt/rezepte/rezept/fisch/fischfilets-an-limonensauce-mit-herzfeuillete';
    // const url = 'https://www.instagram.com/reel/CpTLXKOAtQT/?igshid=MDJmNzVkMjY%3D'; // instagram example stefano zarella
    // const url = 'https://de.pinterest.com/pin/810436895473321696/'; // pinterest example stefano zarella

    const recipeData = await getRecipeData(url)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(recipeData, null, 2))
  }
  catch (error) {
    console.error('Error fetching recipe data:', error)
  }
})()
