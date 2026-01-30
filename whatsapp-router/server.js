const express = require('express');
const app = express();
require('dotenv').config();
const OpenAI = require('openai');
const twilio = require('twilio');

const PORT = process.env.PORT || 3000;

// Family members routing configuration
const familyAgents = {
  '+447745824688': { name: 'Himson', id: 'himson' },
  '+447466832386': { name: 'Him Chu', id: 'himchu' },
  '+447510209093': { name: 'Kennis', id: 'kennis' },
  '+447500424003': { name: 'Cellesse', id: 'cellesse' },
  '+85294689284': { name: 'Murff', id: 'murff' },
  '+85296251662': { name: 'Chung', id: 'chung' },
  '+85256682798': { name: 'DingDing', id: 'dingding' },
  '+85269787283': { name: 'Stephanie', id: 'stephanie' }
};

const botNumber = '+85296256886'; // Your WhatsApp bot number

// Assistant IDs for each family member
const assistantIds = {
  'himson': process.env.ASSISTANT_ID_HIMSON,
  'himchu': process.env.ASSISTANT_ID_HIMCHU,
  'kennis': process.env.ASSISTANT_ID_KENNIS,
  'cellesse': process.env.ASSISTANT_ID_CELLESSE,
  'murff': process.env.ASSISTANT_ID_MURFF,
  'chung': process.env.ASSISTANT_ID_CHUNG,
  'dingding': process.env.ASSISTANT_ID_DINGDING,
  'stephanie': process.env.ASSISTANT_ID_STEPHANIE
};

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.use(express.json());

// Webhook for receiving WhatsApp messages
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || messages.length === 0) {
      return res.status(200).json({ success: true });
    }
    
    for (const message of messages) {
      const fromNumber = message.from;
      const messageText = message.body;
      
      // Find the agent for this phone number
      const agent = familyAgents[fromNumber];
      
      if (agent) {
        console.log(`[${new Date().toISOString()}] Message from ${agent.name} (${fromNumber}): ${messageText}`);
        console.log(`Routing to agent: ${agent.id}`);
                
        // Get the Assistant ID for this agent
        const assistantId = assistantIds[agent.id];
        console.log(`Using Assistant ID: ${assistantId} for agent ${agent.name}`);
        
        // Here you would normally call the actual AI agent
        // For now, we just log the routing
        await handleMessage(fromNumber, agent, messageText);
      } else {
        console.log(`Unknown sender: ${fromNumber}`);
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle incoming message and route to agent
async function handleMessage(from, agent, text) {
  try {
    console.log(`Processing message for ${agent.name}...`);
    
    // Get the Assistant ID for this agent
    const assistantId = assistantIds[agent.id];
    
    if (!assistantId) {
      throw new Error(`No Assistant ID found for agent ${agent.id}`);
    }
    
    console.log(`Using Assistant ID: ${assistantId}`);
    
    // Create a thread
    const thread = await openai.beta.threads.create();
    
    // Add message to thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: text
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId
    });
    
    // Wait for completion
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
        throw new Error(`Run ${runStatus.status}`);
      }
    }
    
    // Get the assistant's response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data[0].content[0].text.value;
    
    console.log(`AI Response: ${assistantMessage}`);
    
    // Send response via Twilio
    await twilioClient.messages.create({
      body: assistantMessage,
      from: 'whatsapp:+14155238886',
      to: from
    });
    
    console.log(`Response sent to ${from}`);
    
  } catch (error) {
    console.error(`Error handling message for ${agent.id}:`, error);
    
    // Send error message to user
    try {
      await twilioClient.messages.create({
        body: 'Sorry, I encountered an error processing your message. Please try again.',
        from: 'whatsapp:+14155238886',
        to: from
      });
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', agents: Object.keys(familyAgents).length });
});

// List available agents
app.get('/agents', (req, res) => {
  const agents = Object.entries(familyAgents).map(([phone, data]) => ({
    name: data.name,
    phone,
    id: data.id
  }));
  res.status(200).json({ agents, botNumber });
});


// Root endpoint
app.get('/', (req, res) => {
 res.status(200).json({ 
   status: 'OK', 
   message: 'WhatsApp Family Router is running', 
   botNumber,
   agents: Object.keys(familyAgents).length,
   version: '1.0.0'
 });
});

app.listen(PORT, () => {
  console.log(`WhatsApp Family Router listening on port ${PORT}`);
  console.log(`Bot Number: ${botNumber}`);
  console.log(`Available agents: ${Object.keys(familyAgents).length}`);
});
