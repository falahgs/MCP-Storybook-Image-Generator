import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as util from 'util';
import * as os from 'os';
import dotenv from 'dotenv';
import { execFile } from 'child_process';

// Load environment variables
dotenv.config();

// Debug mode flag
const DEBUG = process.env.DEBUG === 'true';

// Debug logger function to avoid polluting stdout/stderr
function debugLog(...args: any[]): void {
  if (DEBUG) {
    console.error('[DEBUG]', ...args);
  }
}

// Initialize promisify for exec
const execFileAsync = util.promisify(execFile);

// Server initialization
const server = new Server({
  name: "mcp-storybook-image-generator",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
});

// Check for CLI values
const cliValues = (global as any).__CLI_VALUES__ || {};
const cliApiKey = cliValues['api-key'];

// Initialize Gemini AI (prefer CLI value over environment variable)
const API_KEY = cliApiKey || process.env.GEMINI_API_KEY;

if (!API_KEY && !process.argv.includes('--help')) {
  console.error("Error: GEMINI_API_KEY is required. Use --api-key or set the GEMINI_API_KEY environment variable.");
  process.exit(1);
}

const genAI = new GoogleGenAI({
  apiKey: API_KEY
});

// Configuration for image generation
const imageGenConfig = {
  responseModalities: [
    'image',
    'text',
  ],
  responseMimeType: 'text/plain',
};

// Configuration for story generation
const storyGenConfig = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 1000,
};

// Model names
const imageModel = 'gemini-2.0-flash-exp-image-generation';
const storyModel = 'gemini-1.5-pro';

// OS path handling functions
function getDesktopPath(): string {
  try {
    const home = os.homedir();
    const username = os.userInfo().username;
    
    // Use debug logging
    debugLog(`Detected username: ${username}`);
    debugLog(`Detected home directory: ${home}`);
    
    if (os.platform() === 'win32') {
      // Windows
      const desktopPath = process.env.USERPROFILE 
        ? path.join(process.env.USERPROFILE, 'Desktop')
        : path.join('C:', 'Users', username, 'Desktop');
      
      debugLog(`Windows desktop path: ${desktopPath}`);
      
      if (fs.existsSync(desktopPath)) {
        return desktopPath;
      } else {
        debugLog(`Desktop path not found: ${desktopPath}, falling back to home`);
        return home;
      }
    } else if (os.platform() === 'darwin') {
      // macOS
      const desktopPath = path.join(home, 'Desktop');
      debugLog(`macOS desktop path: ${desktopPath}`);
      return desktopPath;
    } else {
      // Linux
      const xdgDesktop = process.env.XDG_DESKTOP_DIR;
      if (xdgDesktop && fs.existsSync(xdgDesktop)) {
        debugLog(`Linux XDG desktop path: ${xdgDesktop}`);
        return xdgDesktop;
      }
      const linuxDesktop = path.join(home, 'Desktop');
      if (fs.existsSync(linuxDesktop)) {
        debugLog(`Linux desktop path: ${linuxDesktop}`);
        return linuxDesktop;
      }
      debugLog(`Using home directory: ${home}`);
      return home;
    }
  } catch (error) {
    console.error('Error detecting desktop path:', error);
    return os.homedir();
  }
}

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
      console.error(`Failed to create directory "${dirPath}":`, error);
      throw error;
    }
  }
}

async function saveImageWithProperPath(buffer: Buffer, fileName: string): Promise<{savedPath: string}> {
  try {
    // Check if SAVE_TO_DESKTOP is true
    if (process.env.SAVE_TO_DESKTOP === "true") {
      // Desktop saving logic
      const desktopSaveDir = path.join(getDesktopPath(), 'storybook-images');
      
      debugLog(`Saving to desktop directory: ${desktopSaveDir}`);
      debugLog(`Platform: ${os.platform()}`);
      
      // Ensure save directory exists
      ensureDirectoryExists(desktopSaveDir);
      
      // Create full path and normalize for OS
      const outputPath = path.normalize(path.join(desktopSaveDir, fileName));
      
      // Save the file
      fs.writeFileSync(outputPath, buffer);
      debugLog(`Image saved successfully to: ${outputPath}`);
      
      return { savedPath: outputPath };
    } else {
      // Save locally in the server directory
      const serverDir = process.cwd();
      const localSaveDir = path.join(serverDir, 'storybook-images');
      
      debugLog(`Saving to server directory: ${localSaveDir}`);
      
      // Ensure output directory exists
      ensureDirectoryExists(localSaveDir);
      
      // Create full path and normalize for OS
      const outputPath = path.normalize(path.join(localSaveDir, fileName));
      
      // Save the file
      fs.writeFileSync(outputPath, buffer);
      debugLog(`Image saved successfully to server path: ${outputPath}`);
      
      return { savedPath: outputPath };
    }
  } catch (error) {
    console.error('Error saving image:', error);
    // Fallback to output directory
    const fallbackDir = path.join(process.cwd(), 'output');
    ensureDirectoryExists(fallbackDir);
    const fallbackPath = path.join(fallbackDir, fileName);
    fs.writeFileSync(fallbackPath, buffer);
    debugLog(`Fallback save to: ${fallbackPath}`);
    return { savedPath: fallbackPath };
  }
}

async function saveStoryWithProperPath(story: string, fileName: string): Promise<{savedPath: string}> {
  try {
    // Check if SAVE_TO_DESKTOP is true
    if (process.env.SAVE_TO_DESKTOP === "true") {
      // Desktop saving logic
      const desktopStoryDir = path.join(getDesktopPath(), 'storybook-images');
      
      // Ensure save directory exists
      ensureDirectoryExists(desktopStoryDir);
      
      // Create full path and normalize for OS
      const outputPath = path.normalize(path.join(desktopStoryDir, fileName));
      
      // Save the file
      fs.writeFileSync(outputPath, story, 'utf8');
      debugLog(`Story saved successfully to: ${outputPath}`);
      
      return { savedPath: outputPath };
    } else {
      // Save locally in the server directory
      const serverDir = process.cwd();
      const localStoryDir = path.join(serverDir, 'storybook-images');
      
      // Ensure output directory exists
      ensureDirectoryExists(localStoryDir);
      
      // Create full path and normalize for OS
      const outputPath = path.normalize(path.join(localStoryDir, fileName));
      
      // Save the file
      fs.writeFileSync(outputPath, story, 'utf8');
      debugLog(`Story saved successfully to server path: ${outputPath}`);
      
      return { savedPath: outputPath };
    }
  } catch (error) {
    console.error('Error saving story:', error);
    // Fallback to output directory
    const fallbackDir = path.join(process.cwd(), 'output');
    ensureDirectoryExists(fallbackDir);
    const fallbackPath = path.join(fallbackDir, fileName);
    fs.writeFileSync(fallbackPath, story, 'utf8');
    debugLog(`Fallback save to: ${fallbackPath}`);
    return { savedPath: fallbackPath };
  }
}

async function openInBrowser(filePath: string): Promise<void> {
  try {
    // Check for headless environment
    if (process.env.DISPLAY === undefined && os.platform() !== 'win32' && os.platform() !== 'darwin') {
      console.log('Headless environment detected, skipping browser open');
      return;
    }
    
    // Ensure path is properly formatted for the OS
    const normalizedPath = path.normalize(filePath);
    
    // Different commands for different OSes
    const command = os.platform() === 'win32' 
      ? 'explorer'
      : os.platform() === 'darwin'
        ? 'open'
        : 'xdg-open';

    const args = [normalizedPath];
    
    await execFileAsync(command, args);
    console.log(`Opened in browser: ${normalizedPath}`);
  } catch (error) {
    console.error('Error opening file in browser:', error);
    console.log('Unable to open browser automatically. File saved at:', filePath);
  }
}

// Generate a story based on prompt
async function generateStory(prompt: string): Promise<string> {
  try {
    const storyPrompt = `Write a short children's story based on the following prompt: "${prompt}". 
    The story should be engaging, appropriate for young children, have a clear beginning, middle, and end, 
    and convey a positive message or lesson. Keep it under 500 words.`;
    
    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: storyPrompt,
          },
        ],
      },
    ];

    // Using the same model, but for text content
    const response = await genAI.models.generateContentStream({
      model: storyModel,
      contents
    });
    
    // Collect all text chunks
    let storyText = '';
    for await (const chunk of response) {
      if (chunk.candidates && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
        const part = chunk.candidates[0].content.parts[0];
        if (typeof part.text === 'string') {
          storyText += part.text;
        }
      }
    }
    
    return storyText || "Once upon a time... (Story generation failed, but the image has been created)";
  } catch (error) {
    console.error('Error generating story:', error);
    return `Once upon a time... (Story generation failed: ${error instanceof Error ? error.message : String(error)})`;
  }
}

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Image with story generation tool
      {
        name: "generate_storybook_image",
        description: "Generates a 3D style cartoon image with a children's story based on the given prompt",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The prompt describing the storybook scene to generate"
            },
            fileName: {
              type: "string",
              description: "Base name for the output files (without extension)"
            },
            artStyle: {
              type: "string",
              description: "The art style for the image (default: '3d cartoon')",
              enum: ["3d cartoon", "watercolor", "pixel art", "hand drawn", "claymation"]
            }
          },
          required: ["prompt", "fileName"]
        }
      }
    ]
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const toolName = request.params.name;
  const args = request.params.arguments;

  try {
    if (toolName === "generate_storybook_image") {
      const { prompt, fileName, artStyle = "3d cartoon" } = args;
      
      // Generate the story first
      const story = await generateStory(prompt);
      
      // Create story filename
      const storyFileName = `${fileName.replace(/\.[^/.]+$/, '')}_story.txt`;
      const { savedPath: storyPath } = await saveStoryWithProperPath(story, storyFileName);
      
      // Add art style to the prompt
      const imagePrompt = `Generate a ${artStyle} style image for a children's storybook with this scene: ${prompt}. 
      The image should be colorful, playful, and child-friendly. Use bright colors, appealing characters, 
      and a fun, engaging style that appeals to children.`;
      
      const contents = [
        {
          role: 'user',
          parts: [
            {
              text: imagePrompt,
            },
          ],
        },
      ];

      try {
        const response = await genAI.models.generateContentStream({
          model: imageModel,
          config: imageGenConfig,
          contents,
        });

        for await (const chunk of response) {
          if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
            continue;
          }
          if (chunk.candidates[0].content.parts[0].inlineData) {
            const inlineData = chunk.candidates[0].content.parts[0].inlineData;
            const buffer = Buffer.from(inlineData.data || '', 'base64');
            
            // Create an output filename with timestamp for uniqueness
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFileName = fileName.endsWith('.png') 
              ? fileName 
              : `${fileName}_${timestamp}.png`;
            
            // Find appropriate save location
            const { savedPath } = await saveImageWithProperPath(buffer, outputFileName);
            
            // Create HTML preview that includes the story
            const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>Storybook Preview</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; background-color: #f9f9f9; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .image-container { text-align: center; margin: 20px 0; }
                img { max-width: 100%; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .prompt { margin: 10px 0; color: #666; font-style: italic; }
                .story { margin: 20px 0; line-height: 1.6; white-space: pre-line; }
                .path { font-family: monospace; margin: 10px 0; font-size: 12px; color: #888; }
                h1 { color: #4a4a4a; text-align: center; }
                h2 { color: #5a5a5a; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Storybook Image</h1>
                <div class="prompt">Prompt: ${prompt}</div>
                <div class="image-container">
                  <img src="file://${savedPath}" alt="Generated storybook image">
                </div>
                <h2>The Story</h2>
                <div class="story">${story}</div>
                <div class="path">Image saved to: ${savedPath}</div>
                <div class="path">Story saved to: ${storyPath}</div>
              </div>
            </body>
            </html>
            `;

            // Create and save HTML file
            const htmlFileName = `${outputFileName.replace('.png', '')}_preview.html`;
            const htmlPath = path.join(path.dirname(savedPath), htmlFileName);
            
            // Ensure directory exists before writing
            ensureDirectoryExists(path.dirname(htmlPath));
            fs.writeFileSync(htmlPath, htmlContent, 'utf8');

            // Try to open in browser
            try {
              await openInBrowser(htmlPath);
            } catch (error) {
              console.warn('Could not open browser automatically:', error);
            }

            return {
              toolResult: {
                success: true,
                imagePath: savedPath,
                storyPath: storyPath,
                htmlPath: htmlPath,
                content: [
                  {
                    type: "text",
                    text: `Storybook generated successfully!\nImage saved to: ${savedPath}\nStory saved to: ${storyPath}\nPreview HTML: ${htmlPath}`
                  }
                ],
                message: "Storybook image and story generated and saved"
              }
            };
          }
        }
        
        throw new McpError(ErrorCode.InternalError, "No image data received from the API");
      } catch (error) {
        console.error('Error generating image:', error);
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InternalError, `Failed to generate image: ${error.message}`);
        }
        throw new McpError(ErrorCode.InternalError, 'An unknown error occurred');
      }
    } else {
      throw new McpError(ErrorCode.InternalError, `Unknown tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`Error processing ${toolName}:`, error);
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error processing request: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

// Only log in debug mode
if (DEBUG) {
  console.error("MCP Storybook Image Generator Server running");
} 