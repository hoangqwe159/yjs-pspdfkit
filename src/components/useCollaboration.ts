import PSPDFKit, {
  type AnnotationJSONUnion,
  type AnnotationsBackendJSONUnion,
  type BookmarkJSON,
  type Bookmark$1,
  type Comment$1,
  type CommentJSON,
  type Instance,
  type FormFieldJSON,
  type ButtonFormField,
  type CheckBoxFormField,
  type ComboBoxFormField,
  type ListBoxFormField,
  type RadioButtonFormField,
  type TextFormField,
  type SignatureFormField,
  type Change$1,
} from 'pspdfkit';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';

type FormFiledUnion = ListBoxFormField | ComboBoxFormField | RadioButtonFormField | CheckBoxFormField | TextFormField | ButtonFormField | SignatureFormField;

type AttachmentJson = {
  customAttachmentId: string;
};

export type FormFieldValueJson = {
  name: string;
  value: null | string | string[];
  type: string;
  v: number;
};

type YjsConfig = {
  roomName: string;
  signaling: string[];
  password?: string;
};

type YjsInterface =
  | {
      yDoc: Y.Doc;
      yArrayAnnotations: Y.Array<AnnotationJSONUnion>;
      yMapAttachments: Y.Map<AttachmentJson>;
      yArrayComments: Y.Array<CommentJSON>;
      yArrayBookmarks: Y.Array<BookmarkJSON>;
      yArrayFormFields: Y.Array<FormFieldJSON>;
      yArrayFormFieldValues: Y.Array<FormFieldValueJson>;
      webrtcProvider: WebrtcProvider;
      indexeddbProvider: IndexeddbPersistence;
      isIndexeddbReady: boolean;
      isWebRtcReady: boolean;
    }
  | undefined;

// Initialize Yjs and connect to the room
export const useYjs = ({ roomName, signaling, password }: YjsConfig): YjsInterface => {
  const [isIndexeddbReady, setIndexeddbReady] = useState(false);
  const [isWebRtcReady, setIsWebRtcReady] = useState(false);

  const yObject = useMemo(() => {
    if (!roomName) {
      return undefined;
    }
    try {
      const yDoc = new Y.Doc();
      const yArrayAnnotations = yDoc.getArray<AnnotationJSONUnion>('annotations');
      const yMapAttachments = yDoc.getMap<AttachmentJson>('attachments');
      const yArrayComments = yDoc.getArray<CommentJSON>('comments');
      const yArrayBookmarks = yDoc.getArray<BookmarkJSON>('bookmarks');
      const yArrayFormFields = yDoc.getArray<FormFieldJSON>('formFields');
      const yArrayFormFieldValues = yDoc.getArray<FormFieldValueJson>('formFieldValues');

      const webrtcProvider = new WebrtcProvider(roomName, yDoc, {
        password,
        signaling,
      });
      const indexeddbProvider = new IndexeddbPersistence(roomName, yDoc);

      return {
        yDoc,
        yArrayAnnotations,
        yMapAttachments,
        yArrayComments,
        yArrayBookmarks,
        yArrayFormFields,
        yArrayFormFieldValues,
        webrtcProvider,
        indexeddbProvider,
      };
    } catch {
      return undefined;
    }
  }, [password, roomName, signaling]);

  useEffect(() => {
    if (!yObject) {
      setIndexeddbReady(false);
      setIsWebRtcReady(false);
      return;
    }

    yObject.indexeddbProvider.on('synced', () => {
      setIndexeddbReady(true);
    });

    (async function webRtcConnected() {
      await new Promise((resolve) => {
        setTimeout(resolve, 500); // TODO: Fix this work around
      });

      setIsWebRtcReady(true);
    })();

    yObject.webrtcProvider.on('status', async (event) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });

      setIsWebRtcReady(event.connected);
    });

    yObject.webrtcProvider.on('synced', console.log);

    yObject.webrtcProvider.on('peers', console.log);

    return () => {
      yObject.webrtcProvider.destroy();
      yObject.indexeddbProvider.destroy();
    };
  }, [yObject]);

  // @ts-expect-error: Expose Yjs object to the window
  window.yObject = yObject;
  // @ts-expect-error: Expose Yjs object to the window
  window.yDoc = yObject?.yDoc;
  // @ts-expect-error: Expose Yjs object to the window
  window.yArrayAnnotations = yObject?.yArrayAnnotations;
  // @ts-expect-error: Expose Yjs object to the window
  window.yMapAttachments = yObject?.yMapAttachments;
  // @ts-expect-error: Expose Yjs object to the window
  window.yArrayComments = yObject?.yArrayComments;
  // @ts-expect-error: Expose Yjs object to the window
  window.yArrayBookmarks = yObject?.yArrayBookmarks;
  // @ts-expect-error: Expose Yjs object to the window
  window.yArrayFormFields = yObject?.yArrayFormFields;
  // @ts-expect-error: Expose Yjs object to the window
  window.yArrayFormFieldValues = yObject?.yArrayFormFieldValues
  // @ts-expect-error: Expose Yjs object to the window
  window.clearAll = () => {
    yObject?.yArrayAnnotations.delete(0, yObject?.yArrayAnnotations.length);
    yObject?.yMapAttachments.clear();
    yObject?.yArrayComments.delete(0, yObject?.yArrayComments.length);
    yObject?.yArrayBookmarks.delete(0, yObject?.yArrayBookmarks.length);
    yObject?.yArrayFormFields.delete(0, yObject?.yArrayFormFields.length);
    yObject?.yArrayFormFieldValues.delete(0, yObject?.yArrayFormFieldValues.length);
  }
  // @ts-expect-error: Expose Yjs object to the window
  window.getInstantHistory = () => {
    return yObject?.yDoc.toJSON();
  }

  return useMemo(
    () =>
      yObject
        ? {
            yDoc: yObject.yDoc,
            yArrayAnnotations: yObject.yArrayAnnotations,
            yMapAttachments: yObject.yMapAttachments,
            yArrayComments: yObject.yArrayComments,
            yArrayBookmarks: yObject.yArrayBookmarks,
            yArrayFormFields: yObject.yArrayFormFields,
            yArrayFormFieldValues: yObject.yArrayFormFieldValues,
            webrtcProvider: yObject.webrtcProvider,
            indexeddbProvider: yObject.indexeddbProvider,
            isIndexeddbReady,
            isWebRtcReady,
          }
        : undefined,
    [yObject, isIndexeddbReady, isWebRtcReady]
  );
};

// Observes Yjs changes
// Do the Yjs transaction when the PSPDFKit changes
export const useCollaboration = (instance: Instance | null, roomName: string, signaling: string[], password?: string): YjsInterface => {
  const isHandlingYjsChange = useRef(false);
  const isHandlingPSPDFKitChange = useRef(false);

  const config = useMemo(
    () => ({
      roomName,
      signaling,
      password,
    }),
    [password, roomName, signaling]
  );

  const yObject = useYjs(config);

  useEffect(() => {
    if (!instance) return;
    if (!yObject) return;

    // @ts-expect-error: Expose Yjs object to the window
    window.instance = instance;

    const { yDoc, yArrayAnnotations, yArrayComments, yArrayBookmarks, yArrayFormFields, yArrayFormFieldValues, isIndexeddbReady, isWebRtcReady } = yObject;

    if (!isIndexeddbReady || !isWebRtcReady) return;

    yArrayFormFieldValues.observe(async (event) => {
      if (event.target !== yArrayFormFieldValues || isHandlingPSPDFKitChange.current) return;

      isHandlingYjsChange.current = true;

      const deletedItems = Array.from(event.changes.deleted).map((item) => item.content.getContent()[0]);
      const addedItems = Array.from(event.changes.added).map((item) => item.content.getContent()[0]);
      const updatedItems = addedItems.filter((addedItem) => deletedItems.some((deletedItem) => addedItem.name === deletedItem.name));

      for (const item of updatedItems) {
        instance.setFormFieldValues({
          [item.name]: item.value,
        });
      }

      isHandlingYjsChange.current = false;
    });

    yArrayFormFields.observe(async (event) => {
      if (event.target !== yArrayFormFields || isHandlingPSPDFKitChange.current) return;

      isHandlingYjsChange.current = true;

      const deletedItems = Array.from(event.changes.deleted).map((item) => item.content.getContent()[0]);
      const addedItems = Array.from(event.changes.added).map((item) => item.content.getContent()[0]);

      const updatedItems = addedItems.filter((addedItem) => deletedItems.some((deletedItem) => addedItem.id === deletedItem.id));
      const filteredDeletedItems = deletedItems.filter((deletedItem) => !updatedItems.some((updatedItem) => updatedItem.id === deletedItem.id));
      for (const item of filteredDeletedItems) {
        await instance.delete(item.id);
      }

      for (const item of updatedItems) {
        const formField = await backendJsonToFormField(item);
        if (!formField) continue;

        await instance.update(formField);
      }

      isHandlingYjsChange.current = false;
    });

    yArrayBookmarks.observe(async (event) => {
      if (event.target !== yArrayBookmarks || isHandlingPSPDFKitChange.current) return;

      isHandlingYjsChange.current = true;

      const deletedItems = Array.from(event.changes.deleted).map((item) => item.content.getContent()[0]);
      const addedItems = Array.from(event.changes.added).map((item) => item.content.getContent()[0]);

      const updatedItems = addedItems.filter((addedItem) => deletedItems.some((deletedItem) => addedItem.id === deletedItem.id));
      const filteredDeletedItems = deletedItems.filter((deletedItem) => !updatedItems.some((updatedItem) => updatedItem.id === deletedItem.id));
      const filteredAddedItems = addedItems.filter((addedItem) => !updatedItems.some((updatedItem) => updatedItem.id === addedItem.id));

      for (const item of filteredDeletedItems) {
        await instance.delete(item.id);
      }

      for (const item of updatedItems) {
        const bookmark = await backendJsonToBookmark(item);
        if (!bookmark) continue;

        await instance.update(bookmark);
      }

      for (const item of filteredAddedItems) {
        const bookmark = await backendJsonToBookmark(item);
        if (!bookmark) continue;

        await instance.create(bookmark);
      }

      isHandlingYjsChange.current = false;
    });

    yArrayComments.observe(async (event) => {
      if (event.target !== yArrayComments || isHandlingPSPDFKitChange.current) return;

      isHandlingYjsChange.current = true;

      const deletedItems = Array.from(event.changes.deleted).map((item) => item.content.getContent()[0]);
      const addedItems = Array.from(event.changes.added).map((item) => item.content.getContent()[0]);

      // add the same id in deletedItems and addedItems to updatedItems
      const updatedItems = addedItems.filter((addedItem) => deletedItems.some((deletedItem) => addedItem.id === deletedItem.id));
      const filteredDeletedItems = deletedItems.filter((deletedItem) => !updatedItems.some((updatedItem) => updatedItem.id === deletedItem.id));
      const filteredAddedItems = addedItems.filter((addedItem) => !updatedItems.some((updatedItem) => updatedItem.id === addedItem.id));

      for (const item of filteredDeletedItems) {
        await instance.delete(item.id);
      }

      for (const item of updatedItems) {
        const comment = await backendJsonToComment(item);
        if (!comment) continue;

        await instance.update(comment);
      }

      for (const item of filteredAddedItems) {
        const comment = await backendJsonToComment(item);
        if (!comment) continue;

        await instance.create(comment);
      }

      isHandlingYjsChange.current = false;
    });

    yArrayAnnotations.observe(async (event) => {
      if (event.target !== yArrayAnnotations || isHandlingPSPDFKitChange.current) return;

      isHandlingYjsChange.current = true;

      const deletedItems: AnnotationsBackendJSONUnion[] = Array.from(event.changes.deleted).map((item) => item.content.getContent()[0]);
      const addedItems: AnnotationsBackendJSONUnion[] = Array.from(event.changes.added).map((item) => item.content.getContent()[0]);

      // add the same id in deletedItems and addedItems to updatedItems
      const updatedItems = addedItems.filter((addedItem) => deletedItems.some((deletedItem) => addedItem.id === deletedItem.id));
      const filteredDeletedItems = deletedItems.filter((deletedItem) => !updatedItems.some((updatedItem) => updatedItem.id === deletedItem.id));
      const filteredAddedItems = addedItems.filter((addedItem) => !updatedItems.some((updatedItem) => updatedItem.id === addedItem.id));

      for (const item of filteredDeletedItems) {
        await instance.delete(item.id);
      }

      for (const item of updatedItems) {
        const pageIndex = item.pageIndex;
        const pageAnnotations = await instance.getAnnotations(pageIndex); 
        const currentAnnotation = pageAnnotations.find((a) => a.id === item.id);
        if (item.pdfObjectId && !currentAnnotation?.pdfObjectId) {
          item.pdfObjectId = undefined;
        } else if (!item.pdfObjectId && currentAnnotation?.pdfObjectId) {
          item.pdfObjectId = currentAnnotation.pdfObjectId;
        }

        const annotation = await backendJsonToAnnotation(item, instance);
        if (!annotation) continue;

        await instance.update(annotation);
      }

      const addedChanges: Change$1[] = [];
      for (const item of filteredAddedItems) {
        const annotation = await backendJsonToAnnotation(item, instance);
        if (!annotation) continue;

        addedChanges.push(...annotation);
      }

      await instance.create(addedChanges);
      isHandlingYjsChange.current = false;
    });

    // Handle annotation updates from PSPDFKit
    instance.addEventListener('annotations.update', (annotations) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        for (const annotation of annotations) {
          const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation);
          const index = yArrayAnnotations.toArray().findIndex((a) => a.id === jsonAnnotation.id);
          if (index !== -1) {
            yDoc.transact(() => {
              yArrayAnnotations.delete(index, 1);
              yArrayAnnotations.insert(index, [jsonAnnotation]);
            });
          }
        }
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    // Handle annotation creation from PSPDFKit
    instance.addEventListener('annotations.create', async (annotations) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        yDoc.transact(async () => {
          const jsonAnnotations: AnnotationJSONUnion[] = [];
          for (const annotation of annotations) {
            const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation) as AnnotationJSONUnion;

            if (jsonAnnotation.type === 'pspdfkit/image') {
              if (jsonAnnotation.imageAttachmentId) {
                const blob = await instance.getAttachment(jsonAnnotation.imageAttachmentId);
                const customAttachmentId = await uploadImage(blob);

                jsonAnnotation.customData = {
                  customAttachmentId  
                };
              }
            } else if (jsonAnnotation.type === 'pspdfkit/widget') {
              const formFieldName = jsonAnnotation.formFieldName;
              const allFormFields = (await instance.getFormFields()).map(PSPDFKit.FormFields.toSerializableObject);

              const formField = allFormFields.find((item) => item.name === formFieldName);

              if (formField) {
                jsonAnnotation.customData = {
                  formField,
                };
              }
            }

            jsonAnnotations.push(jsonAnnotation);
          }

          yArrayAnnotations.push(jsonAnnotations);
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    // Handle annotation deletion from PSPDFKit
    instance.addEventListener('annotations.delete', (annotations) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        yDoc.transact(() => {
          for (const annotation of annotations) {
            const index = yArrayAnnotations.toArray().findIndex((a) => a.id === annotation.id);
            if (index !== -1) {
              yArrayAnnotations.delete(index, 1);
            }
          }
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('comments.create', async (comments) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;

      try {
        yDoc.transact(() => {
          const jsonComments: CommentJSON[] = [];

          for (const comment of comments) {
            const jsonComment = PSPDFKit.Comment.toSerializableObject(comment);

            jsonComments.push({
              ...jsonComment,
              createdAt: typeof jsonComment.createdAt === 'string' ? jsonComment.createdAt : jsonComment.createdAt.toISOString(),
            });
          }

          yArrayComments.push(jsonComments);
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('comments.update', async (comments) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        for (const comment of comments) {
          const jsonComment = PSPDFKit.Comment.toSerializableObject(comment);
          const index = yArrayComments.toArray().findIndex((a) => a.id === jsonComment.id);
          if (index !== -1) {
            yDoc.transact(() => {
              yArrayComments.delete(index, 1);
              yArrayComments.insert(index, [
                {
                  ...jsonComment,
                  createdAt: typeof jsonComment.createdAt === 'string' ? jsonComment.createdAt : jsonComment.createdAt.toISOString(),
                },
              ]);
            });
          }
        }
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('comments.delete', async (comments) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        yDoc.transact(() => {
          for (const comment of comments) {
            const index = yArrayComments.toArray().findIndex((a) => a.id === comment.id);
            if (index !== -1) {
              yArrayComments.delete(index, 1);
            }
          }
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('comments.delete', console.log);

    instance.addEventListener('bookmarks.create', async (bookmarks) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;

      try {
        yDoc.transact(() => {
          const jsonBookmarks: BookmarkJSON[] = [];

          for (const bookmark of bookmarks) {
            const jsonBookmark = PSPDFKit.Bookmark.toSerializableObject(bookmark);
            jsonBookmarks.push(jsonBookmark);
          }

          yArrayBookmarks.push(jsonBookmarks);
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('bookmarks.update', async (bookmarks) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        for (const bookmark of bookmarks) {
          const jsonBookmark = PSPDFKit.Bookmark.toSerializableObject(bookmark);
          const index = yArrayBookmarks.toArray().findIndex((a) => a.id === jsonBookmark.id);
          if (index !== -1) {
            yDoc.transact(() => {
              yArrayBookmarks.delete(index, 1);
              yArrayBookmarks.insert(index, [jsonBookmark]);
            });
          }
        }
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('bookmarks.delete', async (bookmarks) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        yDoc.transact(() => {
          for (const bookmark of bookmarks) {
            const index = yArrayBookmarks.toArray().findIndex((a) => a.id === bookmark.id);
            if (index !== -1) {
              yArrayBookmarks.delete(index, 1);
            }
          }
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('formFields.create', async (formFields) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;

      try {
        yDoc.transact(() => {
          const jsonFormFieldValues: FormFieldValueJson[] = [];

          for (const formField of formFields) {
            const jsonFormFieldValue = instance.getFormFieldValues()[formField.name];
            jsonFormFieldValues.push({
              name: formField.name,
              type: 'pspdfkit/form-field-value',
              v: 1,
              value: jsonFormFieldValue,
            });
          }

          yArrayFormFieldValues.push(jsonFormFieldValues);
        });

        yDoc.transact(() => {
          const jsonFormFields: FormFieldJSON[] = [];

          for (const formField of formFields) {
            const jsonFormField = PSPDFKit.FormFields.toSerializableObject(formField);
            jsonFormFields.push(jsonFormField);
          }

          yArrayFormFields.push(jsonFormFields);
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('formFields.update', async (formFields) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        for (const formField of formFields) {
          const jsonFormField = PSPDFKit.FormFields.toSerializableObject(formField);
          const index = yArrayFormFields.toArray().findIndex((a) => a.id === jsonFormField.id);
          if (index !== -1) {
            yDoc.transact(() => {
              yArrayFormFields.delete(index, 1);
              yArrayFormFields.insert(index, [jsonFormField]);
            });
          }
        }
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('formFields.delete', async (formFields) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        yDoc.transact(() => {
          for (const formField of formFields) {
            const index = yArrayFormFields.toArray().findIndex((a) => a.id === formField.id);
            const formFieldValueIndex = yArrayFormFieldValues.toArray().findIndex((a) => a.name === formField.name);
            if (index !== -1) {
              yArrayFormFields.delete(index, 1);
            }

            if (formFieldValueIndex !== -1) {
              yArrayFormFieldValues.delete(formFieldValueIndex, 1);
            }
          }
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });

    instance.addEventListener('formFieldValues.update', async (formFieldValues) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        for (const formFieldValue of formFieldValues) {
          const formFieldValueJson = formFieldValue.toJSON();
          const value = formFieldValueJson.value?.toJSON?.() ?? formFieldValueJson.value;

          const index = yArrayFormFieldValues.toArray().findIndex((a) => a.name === formFieldValue.name);
          if (index !== -1) {
            yDoc.transact(() => {
              if (formFieldValueJson.name) {
                yArrayFormFieldValues.delete(index, 1);
                yArrayFormFieldValues.insert(index, [
                  {
                    name: formFieldValueJson.name,
                    value,
                    type: 'pspdfkit/form-field-value',
                    v: 1,
                  },
                ]);
              }
            });
          }
        }
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 500);
      }
    });
  }, [instance, yObject]);

  return yObject;
};

// #region Bunch of utils
async function backendJsonToFormField(item: FormFieldJSON): Promise<FormFiledUnion | undefined> {
  const object = PSPDFKit.FormFields.fromSerializableObject(item);

  let formField: FormFiledUnion | undefined;

  if (object instanceof PSPDFKit.FormFields.ButtonFormField) {
    formField = new PSPDFKit.FormFields.ButtonFormField({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.FormFields.CheckBoxFormField) {
    formField = new PSPDFKit.FormFields.CheckBoxFormField({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.FormFields.ComboBoxFormField) {
    formField = new PSPDFKit.FormFields.ComboBoxFormField({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.FormFields.ListBoxFormField) {
    formField = new PSPDFKit.FormFields.ListBoxFormField({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.FormFields.RadioButtonFormField) {
    formField = new PSPDFKit.FormFields.RadioButtonFormField({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.FormFields.TextFormField) {
    formField = new PSPDFKit.FormFields.TextFormField({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.FormFields.SignatureFormField) {
    formField = new PSPDFKit.FormFields.SignatureFormField({
      ...object.toJSON(),
      id: item.id,
    });
  }

  return formField;
}

async function backendJsonToBookmark(item: BookmarkJSON): Promise<Bookmark$1 | undefined> {
  const object = PSPDFKit.Bookmark.fromSerializableObject(item);

  let bookmark: Bookmark$1 | undefined;

  if (object instanceof PSPDFKit.Bookmark) {
    bookmark = new PSPDFKit.Bookmark({
      ...object.toJSON(),
      id: item.id,
    });
  }

  return bookmark;
}

async function backendJsonToComment(item: CommentJSON): Promise<Comment$1 | undefined> {
  const object = PSPDFKit.Comment.fromSerializableObject(item);

  let comment: Comment$1 | undefined;

  if (object instanceof PSPDFKit.Comment) {
    comment = new PSPDFKit.Comment({
      ...object.toJSON(),
      id: item.id,
    });
  }

  return comment;
}

async function backendJsonToAnnotation(item: AnnotationsBackendJSONUnion, instance: Instance): Promise<Change$1[] | undefined> {
  const object = PSPDFKit.Annotations.fromSerializableObject(item);

  let annotation: Change$1 | undefined;
  let formField: Change$1 | undefined;

  if (object instanceof PSPDFKit.Annotations.CommentMarkerAnnotation) {
    annotation = new PSPDFKit.Annotations.CommentMarkerAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.EllipseAnnotation) {
    annotation = new PSPDFKit.Annotations.EllipseAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.HighlightAnnotation) {
    annotation = new PSPDFKit.Annotations.HighlightAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.ImageAnnotation) {
    let attachmentId: string | undefined;
    let isError =  false;

    const jsonObject = object.toJSON();
    const currentAttachmentId = jsonObject.imageAttachmentId;

    if (item.customData && currentAttachmentId) {
      const attachment = (item.customData as AttachmentJson).customAttachmentId;
      const currentAttachment = await getAttachment(instance, currentAttachmentId);

      if (!currentAttachment) {
        // Get the image from server
        const blob = await getImage(attachment);

        if (blob) {
          attachmentId = await instance.createAttachment(blob);
        } else {
          isError = true;
        }
      } else {
        attachmentId = currentAttachmentId;
      }
    }

    annotation = isError ? undefined : new PSPDFKit.Annotations.ImageAnnotation({
      ...jsonObject,
      imageAttachmentId: attachmentId ?? currentAttachmentId,
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.InkAnnotation) {
    annotation = new PSPDFKit.Annotations.InkAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.LineAnnotation) {
    annotation = new PSPDFKit.Annotations.LineAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.LinkAnnotation) {
    annotation = new PSPDFKit.Annotations.LinkAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.NoteAnnotation) {
    annotation = new PSPDFKit.Annotations.NoteAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.PolygonAnnotation) {
    annotation = new PSPDFKit.Annotations.PolygonAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.PolylineAnnotation) {
    annotation = new PSPDFKit.Annotations.PolylineAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.RectangleAnnotation) {
    annotation = new PSPDFKit.Annotations.RectangleAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.RedactionAnnotation) {
    annotation = new PSPDFKit.Annotations.RedactionAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.SquiggleAnnotation) {
    annotation = new PSPDFKit.Annotations.SquiggleAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.StampAnnotation) {
    annotation = new PSPDFKit.Annotations.StampAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.StrikeOutAnnotation) {
    annotation = new PSPDFKit.Annotations.StrikeOutAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.TextAnnotation) {
    annotation = new PSPDFKit.Annotations.TextAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.UnderlineAnnotation) {
    annotation = new PSPDFKit.Annotations.UnderlineAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.UnknownAnnotation) {
    annotation = new PSPDFKit.Annotations.UnknownAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.WidgetAnnotation) {
    if (item.customData) {
      const [key] = Object.keys(item.customData);

      const formFieldJson = item.customData[key] as FormFieldJSON;

      formField = await backendJsonToFormField(formFieldJson);
    }

    annotation = new PSPDFKit.Annotations.WidgetAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.MarkupAnnotation) {
    annotation = new PSPDFKit.Annotations.MarkupAnnotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else if (object instanceof PSPDFKit.Annotations.Annotation) {
    annotation = new PSPDFKit.Annotations.Annotation({
      ...object.toJSON(),
      id: item.id,
    });
  } else {
    return;
  }

  const result = [];
  if (annotation) {
    result.push(annotation);
  }

  if (formField) {
    result.push(formField);
  }

  return result;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getAttachment(instance: Instance, attachmentId?: string | null): Promise<Blob | undefined> {
  if (!attachmentId) return undefined;
  try {
    const blob = await instance.getAttachment(attachmentId);
    return blob;
  } catch {
    return undefined;
  }
}

export function isYDocEmpty(yObject: YjsInterface): boolean {
  if (!yObject) return true;
  const { yArrayAnnotations, yMapAttachments, yArrayComments, yArrayBookmarks, yArrayFormFields, yArrayFormFieldValues } = yObject;

  return yArrayAnnotations.length === 0 && yMapAttachments.size === 0 && yArrayComments.length === 0 && yArrayBookmarks.length === 0 && yArrayFormFields.length === 0 && yArrayFormFieldValues.length === 0;
}

export async function getPdf() {
  try {
    const response = await fetch('http://localhost:3000/get-pdf');

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return arrayBuffer;
    } else {
      console.error('Failed to get PDF file');
    }
  } catch (error) {
    console.error('Error getting PDF file:', error);
  }
}

export async function getBinaryData() {
  try {
    const response = await fetch('http://localhost:3000/get-binary');

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } else {
      console.error('Failed to get binary data');
    }
  } catch (error) {
    console.error('Error getting binary data:', error);
  }
}

export async function uploadImage(blob: Blob): Promise<string | undefined> {
  const formData = new FormData();
  formData.append('file', blob);

  try {
    const response = await fetch('http://localhost:3000/upload-image', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const json = await response.json();
      return json.id;
    } else {
      console.error('Failed to upload blob');
    }
  } catch (error) {
    console.error('Error uploading blob:', error);
  }
}

export async function getImage(id: string): Promise<Blob | undefined> {
  try {
    const response = await fetch(`http://localhost:3000/get-image/${id}`);

    if (response.ok) {
      const blob = await response.blob();
      return blob;
    } else {
      console.error('Failed to get blob');
    }
  } catch (error) {
    console.error('Error getting blob:', error);
  }
}

export async function uploadPdf(file: File) {
  const formData = new FormData();
  formData.append('pdf', file);

  try {
    const response = await fetch('http://localhost:3000/upload-pdf', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      console.log('PDF file uploaded successfully');
    } else {
      console.error('Failed to upload PDF file');
    }
  } catch (error) {
    console.error('Error uploading PDF file:', error);
  }
}

export async function uploadBinaryData(data: Uint8Array) {
  try {
    const response = await fetch('http://localhost:3000/upload-binary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });

    if (response.ok) {
      console.log('Binary data uploaded successfully');
    } else {
      console.error('Failed to upload binary data');
    }
  } catch (error) {
    console.error('Error uploading binary data:', error);
  }
}

export function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const clonedBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(clonedBuffer).set(new Uint8Array(buffer));
  return clonedBuffer;
}