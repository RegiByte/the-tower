/** Reads a beat aloud: offered on every item of the pulse collection, run by renderers that import modules. */
export async function listen({ tower, target }) {
  const { project, collection, id } = target.value
  const text = await tower.text(`collection/${project}/${collection}/${id}`)
  speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}
