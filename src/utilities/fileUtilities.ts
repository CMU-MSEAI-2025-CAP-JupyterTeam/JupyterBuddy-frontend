/**
 * Utility functions for file handling and processing
 */

/**
 * Converts a File object to a Base64 string representation.
 * This is useful for binary files that need to be transmitted over text-based protocols.
 * 
 * @param file - The File object to be converted to Base64
 * @returns A Promise resolving to the Base64-encoded string representation of the file
 */
export function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create a FileReader instance to read the file contents
      const reader = new FileReader();
      
      // Define what happens when the file is successfully loaded
      reader.onload = () => {
        // Extract the Base64 data from the result
        // The result is in format "data:mime/type;base64,BASE64_DATA"
        // So we split by comma and take the second part
        const base64 = (reader.result as string).split(",")[1]; // Remove data: prefix
        
        // Resolve the promise with the extracted Base64 data
        resolve(base64);
      };
      
      // Define what happens if an error occurs during file reading
      reader.onerror = reject;
      
      // Start reading the file as a data URL (Base64)
      reader.readAsDataURL(file);
    });
  }
  
  /**
   * Builds a payload of file context items for uploading to an API or service.
   * Handles both text and binary files appropriately.
   * 
   * @param files - An array of File objects to process
   * @returns A Promise resolving to an array of context items, each containing filename, type, and content
   */
  export async function buildContextPayload(files: File[]): Promise<any[]> {
    // Process all files concurrently using Promise.all
    const contextItems = await Promise.all(
      files.map(async (file) => {
        // Determine if the file is a text file based on MIME type or extension
        const isText = file.type.startsWith("text/") || file.name.endsWith(".md");
        
        // For text files, get the raw text content
        // For binary files, convert to Base64
        const content = isText
          ? await file.text()
          : await readFileAsBase64(file);
        
        // Return a structured object with file metadata and content
        return {
          filename: file.name,
          type: file.type || "application/octet-stream", // Default MIME type if not specified
          content, // base64 for binary files (PDF/DOCX), raw text for text files
        };
      })
    );
    
    return contextItems;
  }