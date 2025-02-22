// Example using Puppeteer
import puppeteer from 'puppeteer'

export async function getRenderedHtml(url: string): Promise<string> {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle2' })
  const content = await page.content()
  await browser.close()
  return content
}
