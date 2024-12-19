// test.js
const getRecipeData = require('./dist/index').default;

(async () => {
  try {
    // const url = 'https://migusto.migros.ch/de/rezepte/golden-milk';
    const url = 'https://fooby.ch/de/rezepte/21177/ingwer-shot'
    const recipeData = await getRecipeData(url)
    // console.log(JSON.stringify(recipeData, null, 2));
  }
  catch (error) {
    console.error('Error fetching recipe data:', error)
  }
})()
