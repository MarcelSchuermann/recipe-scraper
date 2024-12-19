import type { AxiosResponse } from 'axios'
import * as cheerio from 'cheerio'
import axios from 'axios'
import { validate } from 'jsonschema'

// @ts-expect-error - ...
import microdata from 'microdata-node'
import type { Recipe, WithContext } from 'schema-dts'
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
  else { siteUrl = input }

  const options = { ...DEFAULT_OPTIONS, ...inputOptions }

  if (!isValidHttpUrl(siteUrl) && !options.html)
    throw new Error('Url must start with http:// or https://')

  try {
    const response: AxiosResponse<string> = await axios.get(siteUrl, {
      responseType: 'text',
      headers: {
        'Accept-Language': options.lang,
      },
      timeout: options.timeout,
      maxRedirects: options.maxRedirects,
    })
    html = response.data
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
    const data = microdata.toJson(html)
    if (!data || !data.items || !data.items[0])
      throw new Error('HTML tags provided has no valid recipe schema')

    const recipeData = Object.values(data.items).find((item: any) => item.type[0].includes('Recipe')) as Record<string, any>
    if (!recipeData?.properties)
      throw new Error('Recipe not found on page')

    recipe = recipeData.properties
  }

  const prettifiedRecipe = prettifyRecipe(recipe as Recipe, siteUrl, ogImage)
  if (prettifiedRecipe !== undefined) {
    const response = validate(prettifiedRecipe, schema)
    if (!response.valid)
      throw new Error(`Recipe is not valid: ${response.errors.map(e => e.message).join(', ')}`)

    return prettifiedRecipe
  }
  else {
    throw new Error('Recipe data could not be prettified')
  }
}
