// import type { AxiosResponse } from 'axios'
import * as cheerio from 'cheerio'

// import axios from 'axios'
import { validate } from 'jsonschema'

import microdata from 'microdata-node'
import type { Recipe, WithContext } from 'schema-dts'
import axios from 'axios'
import { getRenderedHtml } from './getHtmlPuppeteer'

// @ts-expect-error - ...
import schema from './schema.json'
import type { IRecipe, Options } from './types'
import { isValidHttpUrl } from './utils'
import propertyTransformerMap from './propertyTransforrmer'

interface WithGraph extends WithContext<Recipe> {
  '@graph': Recipe[]
}

const DEFAULT_OPTIONS = {
  maxRedirects: 5,
  timeout: 10000,
  enableMLFallback: true,
}

function consolidateRecipeProperties(recipe: Record<string, any>): IRecipe {
  return {
    url: recipe.url,
    name: recipe.name,
    image: recipe.image || recipe.thumbnailUrl,
    description: recipe.description,
    cookTime: recipe.cookTime,
    prepTime: recipe.prepTime,
    totalTime: recipe.totalTime,
    recipeYield: recipe.recipeYield,
    recipeIngredients: recipe.recipeIngredient,
    recipeInstructions: recipe.recipeInstructions,
    recipeCategories: recipe.recipeCategory,
    recipeCuisines: recipe.recipeCuisine,
    keywords: recipe.keywords,
  }
}

export interface ConsilidatedRecipe extends ReturnType<typeof consolidateRecipeProperties> {}

function prettifyRecipe(recipe: Recipe, url: string, ogImage?: string): ConsilidatedRecipe {
  const transformedRecipe: Record<string, any> = {}
  const consolidatedRecipe = consolidateRecipeProperties(recipe)

  // Assign the URL
  transformedRecipe.url
    = recipe.url?.toString() || (isValidHttpUrl(url) ? url : undefined)

  // Transform each property using the transformer map
  Object.entries(consolidatedRecipe).forEach(([key, value]) => {
    const propertyTransformer = propertyTransformerMap[key as keyof typeof propertyTransformerMap]
    if (value && propertyTransformer)
      transformedRecipe[key] = propertyTransformer(value)
  })

  // If the image exists, check its resolution
  if (transformedRecipe.image) {
    const dimensionPattern = /v-w-(\d+)-h-(\d+)/
    const match = transformedRecipe.image.match(dimensionPattern)
    if (match) {
      const width = Number.parseInt(match[1], 10)
      const height = Number.parseInt(match[2], 10)
      // If either width or height is less than 500px, use ogImage
      if (width < 500 || height < 500) {
        if (ogImage)
          transformedRecipe.image = ogImage
      }
    }
    else {
      // If no dimension pattern is found, fallback to ogImage
      if (ogImage)
        transformedRecipe.image = ogImage
    }
  }

  return transformedRecipe as ConsilidatedRecipe
}

export default async function getRecipeData(
  input: string | Partial<Options>,
  inputOptions: Partial<Options> = {},
): Promise<ConsilidatedRecipe> {
  let siteUrl: string, html: string, recipe: unknown

  if (typeof input === 'object') {
    inputOptions = input
    siteUrl = input as string
  }
  else {
    siteUrl = input
  }

  const options = { ...DEFAULT_OPTIONS, ...inputOptions }

  if (!isValidHttpUrl(siteUrl) && !options.html)
    throw new Error('Url must start with http:// or https://')

  try {
    html = await getRenderedHtml(siteUrl)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (options.html)
      html = options.html as string
    else
      throw new Error(message)
  }

  const $ = cheerio.load(html)

  // Extract og:image
  const ogImage = $('meta[property="og:image"]').attr('content')

  try {
    // Try to parse ld+json first
    // eslint-disable-next-line no-console
    console.log('Trying to parse ld+json', siteUrl)
    const tags = $('script[type="application/ld+json"]')
    if (tags.length > 0) {
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i]
        const textContent = $(tag).text()
        if (textContent) {
          const data: WithGraph = JSON.parse(textContent)

          if (data['@graph'] && Array.isArray(data['@graph'])) {
            data['@graph'].forEach((g) => {
              if (g['@type'] === 'Recipe')
                recipe = data
            })
          }

          if (data['@type'] === 'Recipe')
            recipe = data

          if (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))
            recipe = data

          if (Array.isArray(data))
            recipe = data.find(obj => obj['@type'] && obj['@type'].includes('Recipe'))
        }
        else {
          throw new Error('Something went wrong while scraping')
        }
      }
    }
    else {
      throw new Error('Trying search for microdata next')
    }
  }
  catch {
    // If we can't parse from ld+json, try microdata approach
    // eslint-disable-next-line no-console
    console.log('Trying to parse microdata', siteUrl)
    const data = microdata.toJson(html)
    if (data && data.items && data.items[0]) {
      const recipeData = Object.values(data.items).find((item: any) => item.type[0].includes('Recipe')) as Record<string, any>
      if (!recipeData?.properties)
        throw new Error('Recipe not found on page')

      recipe = recipeData.properties
    }
    else {
      // FINAL fallback: attempt to extract using common selectors
      const fallbackInstructions: string[] = []
      // Try existing fallback: paragraphs in common containers
      const instructionBlocks = $('div.jeg_food_recipe_instruction, article, main')
      instructionBlocks.each((_, blockEl) => {
        $(blockEl).find('p').each((__, pEl) => {
          const txt = $(pEl).text().trim()
          if (txt)
            fallbackInstructions.push(txt)
        })
      })
      // Additional heuristic: search for elements labeled as recipe instructions or ingredients
      if (fallbackInstructions.length === 0) {
        $('[itemprop="recipeInstructions"]').each((_, el) => {
          const txt = $(el).text().trim()
          if (txt)
            fallbackInstructions.push(txt)
        })
      }
      // Also try to extract ingredients if possible
      const fallbackIngredients: string[] = []
      $('[itemprop="recipeIngredient"]').each((_, el) => {
        const txt = $(el).text().trim()
        if (txt)
          fallbackIngredients.push(txt)
      })
      if (fallbackInstructions.length === 0 && fallbackIngredients.length === 0)
        throw new Error('HTML tags provided has no valid recipe schema')

      // Construct minimal fallback recipe
      recipe = {
        '@type': 'Recipe',
        'name': $('title').text() || 'Untitled',
        'recipeInstructions': fallbackInstructions.length ? fallbackInstructions : undefined,
        'recipeIngredient': fallbackIngredients.length ? fallbackIngredients : undefined,
        'url': siteUrl, // include the URL to match the signature
      }
    }
  }

  const prettifiedRecipe = prettifyRecipe(recipe as Recipe, siteUrl, ogImage)
  let response = validate(prettifiedRecipe, schema)
  if (!response.valid) {
    console.warn('Validation errors:', response.errors.map(e => e.message))

    const fallbackIngredients: string[] = []

    // 1. Try the standard microdata selector
    $('[itemprop="recipeIngredient"]').each((_, el) => {
      const txt = $(el).text().trim()
      if (txt)
        fallbackIngredients.push(txt)
    })

    // 2. Look for elements with class names containing "ingredient" or "ingredients"
    if (fallbackIngredients.length === 0) {
      $('[class*="ingredient"], .ingredients').each((_, el) => {
        $(el).find('li').each((__, li) => {
          const txt = $(li).text().trim()
          if (txt)
            fallbackIngredients.push(txt)
        })
      })
    }

    // 3. Look for headings containing "zutaten" or "ingredients" and extract list items (ul/ol) in the following siblings
    if (fallbackIngredients.length === 0) {
      $('h2, h3').filter((i, el) => {
        const headingText = $(el).text().toLowerCase()
        return headingText.includes('zutaten') || headingText.includes('ingredients')
      }).each((i, heading) => {
        // Check for immediate sibling UL or OL elements until the next heading
        $(heading).nextUntil('h2, h3', 'ul, ol').each((_, list) => {
          $(list).find('li').each((__, li) => {
            const txt = $(li).text().trim()
            if (txt)
              fallbackIngredients.push(txt)
          })
        })
      })
    }

    if (!response.valid && options.enableMLFallback) {
      console.warn('ML fallback triggered')
      // Assume you have the page HTML in the variable "html"
      const mlResponse = await axios.post('http://localhost:3000/extract', { html })
      const mlRecipe = mlResponse.data
      const mlPrettified = prettifyRecipe(mlRecipe as Recipe, siteUrl, ogImage)
      response = validate(mlPrettified, schema)
      if (response.valid)
        return mlPrettified
    }

    if (!response.valid)
      throw new Error(`Recipe is not valid: ${response.errors.map(e => e.message).join(', ')}`)
  }
  return prettifiedRecipe
}
