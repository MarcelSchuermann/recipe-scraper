// test.js
const getRecipeData = require('./dist/index').default;

(async () => {
  try {
    const recipeData = await getRecipeData('https://migusto.migros.ch/de/rezepte/golden-milk');
    console.log(JSON.stringify(recipeData, null, 2));
  } catch (error) {
    console.error('Error fetching recipe data:', error);
  }
})();