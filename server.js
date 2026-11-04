import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

const TABLE_NAME = process.env.TABLE_NAME;
const AWS_REGION = process.env.AWS_REGION;

if (!TABLE_NAME) {
    console.error('Error: TABLE_NAME environment variable is not set.');
    process.exit(1);
}

if (!AWS_REGION) {
    console.error('Error: AWS_REGION environment variable is not set.');
    process.exit(1);
}

const client = new DynamoDBClient({ region: AWS_REGION });
const db = DynamoDBDocumentClient.from(client);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('ok');
});

// Get all notes
app.get('/notes', async (req, res) => {
    try {
        const command = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'pk = :pkValue',
            ExpressionAttributeValues: {
                ':pkValue': 'NOTE'
            }
        });
        const { Items } = await db.send(command);
        // Map items to a more client-friendly format
        const notes = Items.map(item => ({
            id: item.id,
            title: item.title,
            content: item.content,
            timestamp: item.timestamp
        }));
        res.status(200).json(notes);
    } catch (error) {
        console.error('Error fetching notes:', error);
        res.status(500).json({ message: 'Failed to fetch notes', error: error.message });
    }
});

// Create a new note
app.post('/notes', async (req, res) => {
    try {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required.' });
        }

        const noteId = randomUUID();
        const timestamp = new Date().toISOString();

        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                pk: 'NOTE',
                sk: 'NOTE#' + noteId,
                id: noteId,
                title: title,
                content: content,
                timestamp: timestamp
            }
        });
        await db.send(command);
        res.status(201).json({ id: noteId, title: title, content: content, timestamp: timestamp, message: 'Note created successfully' });
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).json({ message: 'Failed to create note', error: error.message });
    }
});

// Get a single note by ID
app.get('/notes/:id', async (req, res) => {
    try {
        const noteId = req.params.id;
        const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                pk: 'NOTE',
                sk: 'NOTE#' + noteId
            }
        });
        const { Item } = await db.send(command);
        if (!Item) {
            return res.status(404).json({ message: 'Note not found' });
        }
        res.status(200).json({
            id: Item.id,
            title: Item.title,
            content: Item.content,
            timestamp: Item.timestamp
        });
    } catch (error) {
        console.error('Error fetching single note:', error);
        res.status(500).json({ message: 'Failed to fetch note', error: error.message });
    }
});

// Update a note
app.put('/notes/:id', async (req, res) => {
    try {
        const noteId = req.params.id;
        const { title, content } = req.body;

        if (!title && !content) {
            return res.status(400).json({ message: 'At least title or content is required for update.' });
        }

        const updateExpressionParts = [];
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};

        if (title) {
            updateExpressionParts.push('#T = :title');
            expressionAttributeValues[':title'] = title;
            expressionAttributeNames['#T'] = 'title';
        }
        if (content) {
            updateExpressionParts.push('#C = :content');
            expressionAttributeValues[':content'] = content;
            expressionAttributeNames['#C'] = 'content';
        }
        updateExpressionParts.push('#TS = :timestamp');
        expressionAttributeValues[':timestamp'] = new Date().toISOString();
        expressionAttributeNames['#TS'] = 'timestamp';

        const updateExpression = 'SET ' + updateExpressionParts.join(', ');

        const command = new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                pk: 'NOTE',
                sk: 'NOTE#' + noteId
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: expressionAttributeNames,
            ReturnValues: 'ALL_NEW'
        });

        const { Attributes } = await db.send(command);
        res.status(200).json({
            id: Attributes.id,
            title: Attributes.title,
            content: Attributes.content,
            timestamp: Attributes.timestamp,
            message: 'Note updated successfully'
        });
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).json({ message: 'Failed to update note', error: error.message });
    }
});

// Delete a note
app.delete('/notes/:id', async (req, res) => {
    try {
        const noteId = req.params.id;
        const command = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
                pk: 'NOTE',
                sk: 'NOTE#' + noteId
            }
        });
        await db.send(command);
        res.status(200).json({ message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ message: 'Failed to delete note', error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on http://0.0.0.0:' + PORT);
});
