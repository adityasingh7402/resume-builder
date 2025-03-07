import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createDocumentTableSchema,
} from "@/db/schema/document";
import { getAuthUser } from "@/lib/kinde";
import { generateDocUUID } from "@/lib/helper";

// Define a proper type for the server storage
interface StorageData {
  [key: string]: any;
}

// LocalStorage helper functions - defined on the server-side but only execute on client
const getLocalStorage = (key: string) => {
  try {
    if (typeof window === 'undefined') return null;
    const data = window.localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Error reading from localStorage [${key}]:`, error);
    return null;
  }
};

const setLocalStorage = (key: string, value: any) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing to localStorage [${key}]:`, error);
  }
};

// Server-side localStorage mock for SSR compatibility
const serverStorage: StorageData = {};

// Universal storage functions that work in both environments
const getStorage = (key: string) => {
  if (typeof window !== 'undefined') {
    return getLocalStorage(key);
  } else {
    return serverStorage[key] || null;
  }
};

const setStorage = (key: string, value: any) => {
  if (typeof window !== 'undefined') {
    setLocalStorage(key, value);
  } else {
    serverStorage[key] = value;
  }
};

// Initialize storage with middleware
const initStorage = async (c: any, next: () => any) => {
  const keys = ['documents', 'personalInfo', 'experience', 'education', 'skills'];
  
  keys.forEach(key => {
    if (!getStorage(key)) {
      setStorage(key, []);
    }
  });
  
  await next();
};

const documentRoute = new Hono()
  .use('*', initStorage)
  .post(
    "/create",
    zValidator("json", createDocumentTableSchema),
    getAuthUser,
    async (c) => {
      try {
        const user = c.get("user");
        const { title } = c.req.valid("json");
        const userId = user.id;
        const authorName = `${user.given_name} ${user?.family_name || ''}`;
        const authorEmail = user.email || '';
        const documentId = generateDocUUID();
        const timestamp = new Date().toISOString();

        const newDoc = {
          id: Date.now(), // This is fine as Date.now() returns a number
          title: title,
          userId: userId,
          documentId: documentId,
          authorName: authorName,
          authorEmail: authorEmail,
          status: "private",
          createdAt: timestamp,
          updatedAt: timestamp
        };

        // Save to storage
        const documents = getStorage('documents') || [];
        documents.push(newDoc);
        setStorage('documents', documents);

        return c.json(
          {
            success: "ok",
            data: newDoc,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Create document error:", error);
        return c.json(
          {
            success: false,
            message: "Failed to create document",
            error: String(error),
          },
          500
        );
      }
    }
  )
  .patch(
    "/update/:documentId",
    zValidator(
      "param",
      z.object({
        documentId: z.string(),
      })
    ),
    getAuthUser,
    async (c) => {
      try {
        const user = c.get("user");
        const { documentId } = c.req.valid("param");
        const userId = user.id;
        const updateData = await c.req.json();

        if (!documentId) {
          return c.json({ error: "DocumentId is required" }, 400);
        }

        // Get all data from storage
        const documents = getStorage('documents') || [];
        let personalInfoItems = getStorage('personalInfo') || [];
        let experienceItems = getStorage('experience') || [];
        let educationItems = getStorage('education') || [];
        let skillsItems = getStorage('skills') || [];

        // Find the document
        const documentIndex = documents.findIndex(
          (doc: { documentId: string; userId: string; }) => doc.documentId === documentId && doc.userId === userId
        );

        if (documentIndex === -1) {
          return c.json({ error: "Document not found" }, 404);
        }

        const existingDocument = documents[documentIndex];

        // Update document basic info
        const { title, thumbnail, summary, themeColor, status, currentPosition, 
                personalInfo, experience, education, skills } = updateData;
                
        if (title) documents[documentIndex].title = title;
        if (thumbnail) documents[documentIndex].thumbnail = thumbnail;
        if (summary) documents[documentIndex].summary = summary;
        if (themeColor) documents[documentIndex].themeColor = themeColor;
        if (status) documents[documentIndex].status = status;
        if (currentPosition) documents[documentIndex].currentPosition = currentPosition;
        
        documents[documentIndex].updatedAt = new Date().toISOString();

        // Update personal info
        if (personalInfo) {
          const personalInfoIndex = personalInfoItems.findIndex(
            (info: { docId: any; }) => info.docId === existingDocument.id
          );

          if (personalInfoIndex !== -1) {
            personalInfoItems[personalInfoIndex] = {
              ...personalInfoItems[personalInfoIndex],
              ...personalInfo
            };
          } else {
            personalInfoItems.push({
              id: Date.now(),
              docId: existingDocument.id,
              ...personalInfo
            });
          }
        }

        // Update experiences
        if (experience && Array.isArray(experience)) {
          for (const exp of experience) {
            const { id, ...data } = exp;
            
            if (id !== undefined) {
              const expIndex = experienceItems.findIndex(
                (item: { id: any; docId: any; }) => item.id === id && item.docId === existingDocument.id
              );
              
              if (expIndex !== -1) {
                experienceItems[expIndex] = {
                  ...experienceItems[expIndex],
                  ...data
                };
              }
            } else {
              experienceItems.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                docId: existingDocument.id,
                ...data
              });
            }
          }
        }

        // Update education
        if (education && Array.isArray(education)) {
          for (const edu of education) {
            const { id, ...data } = edu;
            
            if (id !== undefined) {
              const eduIndex = educationItems.findIndex(
                (item: { id: any; docId: any; }) => item.id === id && item.docId === existingDocument.id
              );
              
              if (eduIndex !== -1) {
                educationItems[eduIndex] = {
                  ...educationItems[eduIndex],
                  ...data
                };
              }
            } else {
              educationItems.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                docId: existingDocument.id,
                ...data
              });
            }
          }
        }

        // Update skills
        if (skills && Array.isArray(skills)) {
          for (const skill of skills) {
            const { id, ...data } = skill;
            
            if (id !== undefined) {
              const skillIndex = skillsItems.findIndex(
                (item: { id: any; docId: any; }) => item.id === id && item.docId === existingDocument.id
              );
              
              if (skillIndex !== -1) {
                skillsItems[skillIndex] = {
                  ...skillsItems[skillIndex],
                  ...data
                };
              }
            } else {
              skillsItems.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                docId: existingDocument.id,
                ...data
              });
            }
          }
        }

        // Save all data back to storage
        setStorage('documents', documents);
        setStorage('personalInfo', personalInfoItems);
        setStorage('experience', experienceItems);
        setStorage('education', educationItems);
        setStorage('skills', skillsItems);

        return c.json(
          {
            success: "ok",
            message: "Updated successfully",
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Update document error:", error);
        return c.json(
          {
            success: false,
            message: "Failed to update document",
            error: String(error),
          },
          500
        );
      }
    }
  )
  .patch(
    "/restore/archive",
    getAuthUser,
    async (c) => {
      try {
        const user = c.get("user");
        const userId = user.id;
        const { documentId, status } = await c.req.json();

        if (!documentId) {
          return c.json({ message: "DocumentId must be provided" }, 400);
        }

        if (status !== "archived") {
          return c.json(
            { message: "Status must be archived before restore" },
            400
          );
        }

        // Get documents from storage
        const documents = getStorage('documents') || [];
        
        // Find the document
        const documentIndex = documents.findIndex(
          (doc: { documentId: any; userId: string; status: string; }) => doc.documentId === documentId && 
                doc.userId === userId && 
                doc.status === "archived"
        );

        if (documentIndex === -1) {
          return c.json({ message: "Document not found" }, 404);
        }

        // Update document status
        documents[documentIndex].status = "private";
        documents[documentIndex].updatedAt = new Date().toISOString();

        // Save back to storage
        setStorage('documents', documents);

        return c.json(
          {
            success: "ok",
            message: "Updated successfully",
            data: documents[documentIndex],
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Restore document error:", error);
        return c.json(
          {
            success: false,
            message: "Failed to restore document",
            error: String(error),
          },
          500
        );
      }
    }
  )
  .get("/all", getAuthUser, async (c) => {
    try {
      const user = c.get("user");
      const userId = user.id;
      
      // Get documents from storage
      const documents = getStorage('documents') || [];
      
      // Filter documents
      const filteredDocuments = documents.filter(
        (doc: { userId: string; status: string; }) => doc.userId === userId && doc.status !== "archived"
      );
      
      // Sort by updatedAt - fixed by converting to Date objects properly
      filteredDocuments.sort((a: { updatedAt: string }, b: { updatedAt: string }) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return c.json({
        success: true,
        data: filteredDocuments,
      });
    } catch (error) {
      console.error("Fetch documents error:", error);
      return c.json(
        {
          success: false,
          message: "Failed to fetch documents",
          error: String(error),
        },
        500
      );
    }
  })
  .get(
    "/:documentId",
    zValidator(
      "param",
      z.object({
        documentId: z.string(),
      })
    ),
    getAuthUser,
    async (c) => {
      try {
        const user = c.get("user");
        const { documentId } = c.req.valid("param");
        const userId = user.id;

        // Get all data from storage
        const documents = getStorage('documents') || [];
        const personalInfoItems = getStorage('personalInfo') || [];
        const experienceItems = getStorage('experience') || [];
        const educationItems = getStorage('education') || [];
        const skillsItems = getStorage('skills') || [];

        // Find the document
        const document = documents.find(
          (doc: { documentId: string; userId: string; }) => doc.documentId === documentId && doc.userId === userId
        );

        if (!document) {
          return c.json({ error: "Document not found" }, 404);
        }

        // Get related data
        const personalInfo = personalInfoItems.find((info: { docId: any; }) => info.docId === document.id);
        const experiences = experienceItems.filter((exp: { docId: any; }) => exp.docId === document.id);
        const educations = educationItems.filter((edu: { docId: any; }) => edu.docId === document.id);
        const skills = skillsItems.filter((skill: { docId: any; }) => skill.docId === document.id);

        return c.json({
          success: true,
          data: {
            ...document,
            personalInfo,
            experiences,
            educations,
            skills
          },
        });
      } catch (error) {
        console.error("Fetch document error:", error);
        return c.json(
          {
            success: false,
            message: "Failed to fetch document",
            error: String(error),
          },
          500
        );
      }
    }
  )
  .get(
    "/public/doc/:documentId",
    zValidator(
      "param",
      z.object({
        documentId: z.string(),
      })
    ),
    async (c) => {
      try {
        const { documentId } = c.req.valid("param");
        
        // Get all data from storage
        const documents = getStorage('documents') || [];
        const personalInfoItems = getStorage('personalInfo') || [];
        const experienceItems = getStorage('experience') || [];
        const educationItems = getStorage('education') || [];
        const skillsItems = getStorage('skills') || [];

        // Find the document that is public
        const document = documents.find(
          (doc: { documentId: string; status: string; }) => doc.documentId === documentId && doc.status === "public"
        );

        if (!document) {
          return c.json(
            {
              error: true,
              message: "unauthorized",
            },
            401
          );
        }

        // Get related data
        const personalInfo = personalInfoItems.find((info: { docId: any; }) => info.docId === document.id);
        const experiences = experienceItems.filter((exp: { docId: any; }) => exp.docId === document.id);
        const educations = educationItems.filter((edu: { docId: any; }) => edu.docId === document.id);
        const skills = skillsItems.filter((skill: { docId: any; }) => skill.docId === document.id);

        return c.json({
          success: true,
          data: {
            ...document,
            personalInfo,
            experiences,
            educations,
            skills
          },
        });
      } catch (error) {
        console.error("Fetch public document error:", error);
        return c.json(
          {
            success: false,
            message: "Failed to fetch document",
            error: String(error),
          },
          500
        );
      }
    }
  )
  .get("/trash/all", getAuthUser, async (c) => {
    try {
      const user = c.get("user");
      const userId = user.id;
      
      // Get documents from storage
      const documents = getStorage('documents') || [];
      
      // Filter archived documents
      const archivedDocuments = documents.filter(
        (doc: { userId: string; status: string; }) => doc.userId === userId && doc.status === "archived"
      );

      return c.json({
        success: true,
        data: archivedDocuments,
      });
    } catch (error) {
      console.error("Fetch trash documents error:", error);
      return c.json(
        {
          success: false,
          message: "Failed to fetch documents",
          error: String(error),
        },
        500
      );
    }
  });

export default documentRoute;