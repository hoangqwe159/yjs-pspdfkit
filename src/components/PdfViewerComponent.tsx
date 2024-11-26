import { useEffect, useRef, useState } from "react";
import PSPDFKit, { Annotation, AnnotationJSONUnion, AnnotationsBackendJSONUnion, BookmarkJSON, Bookmark$1, Comment$1, CommentJSON, Instance, FormField, FormFieldJSON, ButtonFormField, CheckBoxFormField, ChoiceFormField, ComboBoxFormField, ListBoxFormField, RadioButtonFormField, TextFormField, SignatureFormField, Change } from "pspdfkit";
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from "y-webrtc";

type AttachmentJson = {
  binary: string;
  contentType: string;
};

type FormFieldValueJson = {
  name: string;
  value: null | string | string[];
  type: string;
  v: number;
};

// type FormFiledUnion = FormField | ButtonFormField | CheckBoxFormField | ChoiceFormField | ComboBoxFormField | ListBoxFormField | RadioButtonFormField  | TextFormField | SignatureFormField;
type FormFiledUnion = ListBoxFormField | ComboBoxFormField | RadioButtonFormField | CheckBoxFormField | TextFormField | ButtonFormField | SignatureFormField;

const yDoc = new Y.Doc();
const yArrayAnnotations = yDoc.getArray<AnnotationJSONUnion>('annotations');
const yMapAttachments = yDoc.getMap<AttachmentJson>('attachments');
const yArrayComments = yDoc.getArray<CommentJSON>('comments');
const yArrayBookmarks = yDoc.getArray<BookmarkJSON>('bookmarks');
const yArrayFormFields = yDoc.getArray<FormFieldJSON>('formFields');
const yArrayFormFieldValues = yDoc.getArray<FormFieldValueJson>('formFieldValues');

const UNIQ_ROOM_ID = 'AITEST-VIET-3';

const provider = new WebrtcProvider(UNIQ_ROOM_ID, yDoc, { password: 'optional-room-password', signaling: [ 'ws://localhost:4444' ] });
const indexeddbProvider = new IndexeddbPersistence(UNIQ_ROOM_ID, yDoc);

window.clearAll = function () {
  yArrayAnnotations.delete(0, yArrayAnnotations.length);
  yMapAttachments.clear();
  yArrayComments.delete(0, yArrayComments.length);
  yArrayBookmarks.delete(0, yArrayBookmarks.length);
  yArrayFormFields.delete(0, yArrayFormFields.length);
  yArrayFormFieldValues.delete(0, yArrayFormFieldValues.length);
}

window.yArray = yArrayAnnotations;
window.yMap = yMapAttachments;
window.yComments = yArrayComments;
window.yBookmarks = yArrayBookmarks;
window.provider = provider;
window.yDoc = yDoc;
window.yFormFields = yArrayFormFields;
window.yFormFieldValues = yArrayFormFieldValues;

export default function PdfViewerComponent() {
  const containerRef = useRef(null);
  const isHandlingYjsChange = useRef(false);
  const isHandlingPSPDFKitChange = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [isWebRtcReady, setIsWebRtcReady] = useState(false);

  const [instance, setInstance] = useState<Instance | null>(null);

  useEffect(() => {
    indexeddbProvider.on('synced', () => {
      setIsReady(true);
    });

    provider.on("status", async (event) => {
      console.log(yDoc.getXmlElement().length);
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(yDoc.getXmlElement().length);


      console.log('status', event);

      setIsWebRtcReady(event.connected);
      console.log(provider.connected);

    });

    provider.on("synced", (s) => {
      console.log('synced', s);
    });

    provider.on("peers", (peers) => {
      console.log('peers', peers);
    });
  }, []);


  useEffect(() => {
    const container = containerRef.current;

    (async function () {
      if (!container || !isReady || !isWebRtcReady) return;
      PSPDFKit.unload(container); // Ensure that there's only one PSPDFKit instance.

      // We need to make sure that the annotations are loaded before PSPDFKit is
      const instance = await PSPDFKit.load({
        container,
        instantJSON: {
          annotations: yArrayAnnotations.toArray(),
          attachments: yMapAttachments.toJSON(),
          comments: yArrayComments.toArray(),
          bookmarks: yArrayBookmarks.toArray(),
          formFields: yArrayFormFields.toArray(),
          formFieldValues: yArrayFormFieldValues.toArray(),
          format: "https://pspdfkit.com/instant-json/v1",
        },
        document: "/document.pdf",
        baseUrl: `${window.location.protocol}//${window.location.host}/`,
      });

      window.instance = instance;
      instance.setAnnotationCreatorName(Math.random().toString(36).substring(2, 15));
      instance.setToolbarItems((toolbarItems) => {
        return [
          ...toolbarItems,
          {
            type: "form-creator",
          }
        ]
      });
      setInstance(instance);
    })();

    return () => {
      PSPDFKit.unload(container);
    };
  }, [isReady, isWebRtcReady]);

  useEffect(() => {
    if (!instance) return;
    if (!isReady) return;

    yArrayFormFieldValues.observe(async (event) => {
      if (event.target !== yArrayFormFieldValues || isHandlingPSPDFKitChange.current) return;

      isHandlingYjsChange.current = true;

      const deletedItems = Array.from(event.changes.deleted).map((item) => item.content.getContent()[0]);
      const addedItems = Array.from(event.changes.added).map((item) => item.content.getContent()[0]);
      const updatedItems = addedItems.filter((addedItem) => deletedItems.some((deletedItem) => addedItem.name === deletedItem.name));

      for (const item of updatedItems) {
        await instance.setFormFieldValues({
          [item.name]: item.value
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
      const filteredAddedItems = addedItems.filter((addedItem) => !updatedItems.some((updatedItem) => updatedItem.id === addedItem.id));

      for (const item of filteredDeletedItems) {
        await instance.delete(item.id);
      }

      for (const item of updatedItems) {
        const formField = await backendJsonToFormField(item);
        if (!formField) continue;

        await instance.update(formField);
      }

      // for (const item of filteredAddedItems) {
      //   const formField = await backendJsonToFormField(item);
      //   if (!formField) continue;

      //   await instance.create(formField);
      // }

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

      console.log('yArrayComments changed', event.changes.delta);

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

      console.log('yArray changed', event.changes.delta);


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
        const annotation = await backendJsonToAnnotation(item, instance);
        if (!annotation) continue;

        await instance.update(annotation);
      }


      const addedChanges = [];
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
        annotations.forEach((annotation) => {
          const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation);
          const index = yArrayAnnotations.toArray().findIndex((a) => a.id === jsonAnnotation.id);
          if (index !== -1) {
            yDoc.transact(() => {
              yArrayAnnotations.delete(index, 1);
              yArrayAnnotations.insert(index, [jsonAnnotation]);
            });
          }
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
      }
    });

    // Handle annotation creation from PSPDFKit
    instance.addEventListener('annotations.create', async (annotations) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {

        const mediaIds: string[] = [];
        yDoc.transact(async () => {
          const jsonAnnotations = [];
          for (const annotation of annotations) {
            const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation) as AnnotationJSONUnion;

            if (jsonAnnotation.type === 'pspdfkit/image') {
              if (jsonAnnotation.imageAttachmentId) {
                const blob = await instance.getAttachment(jsonAnnotation.imageAttachmentId);
                const binary = await blobToBase64(blob);
                const instantJson = await instance.exportInstantJSON();

                jsonAnnotation.customData = {
                  [jsonAnnotation.imageAttachmentId]: {
                    binary,
                    contentType: blob.type,
                  }
                }

                if (instantJson.attachments) {
                  yMapAttachments.set(jsonAnnotation.imageAttachmentId, {
                    binary: instantJson.attachments[jsonAnnotation.imageAttachmentId].binary,
                    contentType: instantJson.attachments[jsonAnnotation.imageAttachmentId].contentType,
                  });
                }
              }
            } else if (jsonAnnotation.type === 'pspdfkit/widget') {
              const formFieldName = jsonAnnotation.formFieldName;
              const allFormFields = (await instance.getFormFields()).map(PSPDFKit.FormFields.toSerializableObject);

              const formField = allFormFields.find((formField) => formField.name === formFieldName);

              if (formField) {
                jsonAnnotation.customData = {
                  formField,
                }
              }
            }

            jsonAnnotations.push(jsonAnnotation);
          }
          
          yArrayAnnotations.push(jsonAnnotations);
        });

        if (mediaIds.length) {
          const instantJson  = await instance.exportInstantJSON();


          yDoc.transact(() => {
            for (const mediaId of mediaIds) {

              if (!instantJson.attachments) return;
              const attachment = instantJson.attachments[mediaId];
              if (!attachment) continue;

              yMapAttachments.set(mediaId, {
                binary: attachment.binary,
                contentType: attachment.contentType,
              });
            }
          });
        } 
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
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
        }, 100);
      }
    });

    instance.addEventListener('comments.create', async (comments) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;

      try {
        yDoc.transact(() => {
          const jsonComments = [];

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
        }, 100);
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
              yArrayComments.insert(index, [{
                ...jsonComment,
                createdAt: typeof jsonComment.createdAt === 'string' ? jsonComment.createdAt : jsonComment.createdAt.toISOString(),
              }]);
            });
          }
        }
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
      }
    });

    instance.addEventListener('comments.delete', async (comments) => {
      console.log('comments.delete', comments);
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
        }, 100);
      }
    });

    instance.addEventListener('comments.delete', console.log);

    instance.addEventListener('bookmarks.create', async (bookmarks) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;

      try {
        yDoc.transact(() => {
          const jsonBookmarks = [];

          for (const bookmark of bookmarks) {
            const jsonBookmark = PSPDFKit.Bookmark.toSerializableObject(bookmark);
            jsonBookmarks.push(jsonBookmark);
          }

          yArrayBookmarks.push(jsonBookmarks);
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
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
        }, 100);
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
        }, 100);
      }
    });

    instance.addEventListener('formFields.create', async (formFields) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;

      try {
        yDoc.transact(() => {
          const jsonFormFieldValues = [];

          for (const formField of formFields) {
            const jsonFormFieldValue = instance.getFormFieldValues()[formField.name];
            jsonFormFieldValues.push({
              name: formField.name,
              type: "pspdfkit/form-field-value",
              v: 1,
              value: jsonFormFieldValue,
            });
          }

          yArrayFormFieldValues.push(jsonFormFieldValues);
        });
        
        yDoc.transact(() => {
          const jsonFormFields = [];

          for (const formField of formFields) {
            const jsonFormField = PSPDFKit.FormFields.toSerializableObject(formField);
            jsonFormFields.push(jsonFormField);
          }

          yArrayFormFields.push(jsonFormFields);
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
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
        }, 100);
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
        }, 100);
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
                yArrayFormFieldValues.insert(index, [{
                  name: formFieldValueJson.name,
                  value,
                  type: "pspdfkit/form-field-value",
                  v: 1,
                }]);
              }
            });
          }
        }
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
      }
    });
  }, [instance, isReady]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// async function backendJsonToFormFieldValue(item: FormFieldValueJson): Promise<FormFieldValueJson | undefined> {
//   const formFieldValue = new PSPDFKit.FormFieldValue({
//     name: 'Form field name',
//     value: 'Form field value'
//   });
// }

async function backendJsonToFormField(item: FormFieldJSON): Promise<FormFiledUnion | undefined> {
  const object = PSPDFKit.FormFields.fromSerializableObject(item);

  let formField;

  if (object instanceof PSPDFKit.FormFields.ButtonFormField) {
    formField = new PSPDFKit.FormFields.ButtonFormField({
      ...object.toJSON(),
      id: item.id,
    })
  } else if (object instanceof PSPDFKit.FormFields.CheckBoxFormField) {
    formField = new PSPDFKit.FormFields.CheckBoxFormField({
      ...object.toJSON(),
      id: item.id,
    })
  } else if (object instanceof PSPDFKit.FormFields.ComboBoxFormField) {
    formField = new PSPDFKit.FormFields.ComboBoxFormField({
      ...object.toJSON(),
      id: item.id,
    })
  } else if (object instanceof PSPDFKit.FormFields.ListBoxFormField) {
    formField = new PSPDFKit.FormFields.ListBoxFormField({
      ...object.toJSON(),
      id: item.id,
    })
  } else if (object instanceof PSPDFKit.FormFields.RadioButtonFormField) {
    formField = new PSPDFKit.FormFields.RadioButtonFormField({
      ...object.toJSON(),
      id: item.id,
    })
  } else if (object instanceof PSPDFKit.FormFields.TextFormField) {
    formField = new PSPDFKit.FormFields.TextFormField({
      ...object.toJSON(),
      id: item.id,
    })
  } else if (object instanceof PSPDFKit.FormFields.SignatureFormField) {
    formField = new PSPDFKit.FormFields.SignatureFormField({
      ...object.toJSON(),
      id: item.id,
    })
  }

  return formField;
}

async function backendJsonToBookmark(item: BookmarkJSON): Promise<Bookmark$1 | undefined> {
  const object = PSPDFKit.Bookmark.fromSerializableObject(item);

  let bookmark;

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

  let comment;

  if (object instanceof PSPDFKit.Comment) {
    comment = new PSPDFKit.Comment({
      ...object.toJSON(),
      id: item.id,
    });
  }

  return comment;
}

async function backendJsonToAnnotation(item: AnnotationsBackendJSONUnion, instance: Instance): Promise<Change[] | undefined> {
  const object = PSPDFKit.Annotations.fromSerializableObject(item);

  let annotation;
  let formField;

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

    const jsonObject = object.toJSON();
    const currentAttachmentId = jsonObject.imageAttachmentId;
    const currentAttachment =  await getAttachment(instance, currentAttachmentId);

    if (item.customData && !currentAttachment) {
      const key = Object.keys(item.customData)[0];
      const attachment = item.customData[key] as AttachmentJson;

      const response = await fetch(attachment.binary);
      const blob = await response.blob();

      attachmentId = await instance.createAttachment(blob);

    }

    annotation = new PSPDFKit.Annotations.ImageAnnotation({
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

  return formField ? [annotation, formField] : [annotation];
}

// function checkIsObjectAndHasKey (item: unknown, key: string): item is Record<string, unknown> {
//   return typeof item === 'object' && item !== null && key in item;
// }


function blobToBase64(blob: Blob): Promise<string> {
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
