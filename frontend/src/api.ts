export async function generateBlueprint(prompt: string) {
  const response = await fetch("http://localhost:5000/api/blueprint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });

  if (!response.ok) {
    let message = "Backend error";

    try {
      const data = await response.json();
      if (typeof data?.error === "string" && data.error.trim() !== "") {
        message = data.error;
      }
    } catch {
      // Ignore JSON parse errors and fall back to generic message.
    }

    throw new Error(message);
  }

  return await response.json();
}
