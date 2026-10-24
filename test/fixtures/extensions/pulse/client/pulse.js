/** Reads a beat aloud: offered on every item of the pulse collection, run by renderers that import modules. */
export async function listen({ tower, subject }) {
  const text = await tower.text(`/collection/${subject.project}/${subject.collection}/${subject.id}`)
  speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}
