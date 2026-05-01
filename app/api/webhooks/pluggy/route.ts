export async function POST(req: Request) {
  try {
    const event = await req.json();

    console.log("Webhook Pluggy recebido:");
    console.log("Evento:", event.event);
    console.log("Event ID:", event.eventId);
    console.log("Payload completo:", event);

    return Response.json(
      { received: true },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao processar webhook Pluggy:", error);

    return Response.json(
      { received: false, error: "Invalid payload" },
      { status: 400 }
    );
  }
}
