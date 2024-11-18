import { useEffect, useMemo, useRef, useState, version } from "react";
import PSPDFKit, { Annotation, AnnotationBackendJSON, AnnotationsBackendJSONUnion, AnnotationsUnion, InkAnnotation, Instance } from "pspdfkit";
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { useY } from "react-yjs";
import { WebrtcProvider } from "y-webrtc";

interface PdfViewerComponentProps {
  document: string;
}

const yDoc = new Y.Doc();
const yArray = yDoc.getArray<AnnotationsBackendJSONUnion>('annotations');

// const provider = new WebrtcProvider('annotationss', yDoc, { password: 'optional-room-password', signaling: [ 'ws://localhost:4444' ] });


export default function PdfViewerComponent({ document }: PdfViewerComponentProps) {
  const indexeddbProvider = useMemo(() => new IndexeddbPersistence('annotations', yDoc), []);
  // const websocketProvider = useMemo(() => new WebsocketProvider('ws://localhost:1234/ws', 'annotations', yDoc), []);
  const provider = useMemo(() => new WebrtcProvider('annotations', yDoc, { password: 'optional-room-password', signaling: [ 'ws://localhost:4444' ] }), []);
  window.yArray = yArray;

  const containerRef = useRef(null);
  const isHandlingYjsChange = useRef(false);
  const isHandlingPSPDFKitChange = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const yAnnotations = useY(yArray);
  const [instance, setInstance] = useState<Instance | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    (async function () {
      if (!container  ) return;
      PSPDFKit.unload(container); // Ensure that there's only one PSPDFKit instance.

      const instance = await PSPDFKit.load({
        container,
        // instantJSON: {
        //   annotations: yArray.toArray(),
        //   format: "https://pspdfkit.com/instant-json/v1",
        // },
        document: "/document.pdf",
        baseUrl: `${window.location.protocol}//${window.location.host}/`,
      });

      window.instance = instance;
      instance.setAnnotationCreatorName(Math.random().toString(36).substring(2, 15));
      setInstance(instance);
    })();

    return () => {
      PSPDFKit.unload(container);
    };
  }, [document]);

  useEffect(() => {
    if (!instance) return;

    if (isReady) return;

    (async function  loadInstantJson() {
      await instance.applyOperations([
        {
          type: 'applyInstantJson',
          instantJson: {
            annotations: yAnnotations,
            format: "https://pspdfkit.com/instant-json/v1",
          },
        },
      ]);

      setIsReady(true);
    })();
  }, [instance, yAnnotations, isReady]);

  useEffect(() => {
    if (!instance) return;
    if (!isReady) return;


    yArray.observe(async (event) => {
      if (event.target !== yArray || isHandlingPSPDFKitChange.current) return;

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
        const annotation = backendJsonToAnnotation(item);
        if (!annotation) continue;

        await instance.update(annotation);
      }


      const addedChanges = [];
      for (const item of filteredAddedItems) {
        const annotation = backendJsonToAnnotation(item);
        if (!annotation) continue;

        addedChanges.push(annotation);
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
          const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation) as AnnotationsBackendJSONUnion;
          const index = yArray.toArray().findIndex((a) => a.id === jsonAnnotation.id);
          if (index !== -1) {
            yDoc.transact(() => {
              yArray.delete(index, 1);
              yArray.insert(index, [jsonAnnotation]);
            });
          }
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
      }
    });

    instance.addEventListener('annotations.change', () => {
      console.log('annotations.change');
    });

    // Handle annotation creation from PSPDFKit
    instance.addEventListener('annotations.create', (annotations) => {
      if (isHandlingYjsChange.current) return;

      isHandlingPSPDFKitChange.current = true;
      try {
        yDoc.transact(() => {
          const jsonAnnotations = [];
          for (const annotation of annotations) {
            const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation);
            jsonAnnotations.push(jsonAnnotation);
          }
          
          yArray.push(jsonAnnotations);
        });
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
            const index = yArray.toArray().findIndex((a) => a.id === annotation.id);
            if (index !== -1) {
              yArray.delete(index, 1);
            }
          }
        });
      } finally {
        setTimeout(() => {
          isHandlingPSPDFKitChange.current = false;
        }, 100);
      }
    });
  }, [instance, isReady]);

  return <div ref={containerRef} className="w-full h-full" />;
}

function backendJsonToAnnotation(item: AnnotationsBackendJSONUnion): Annotation | undefined {
  const object = PSPDFKit.Annotations.fromSerializableObject(item);

  let annotation;
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
    annotation = new PSPDFKit.Annotations.ImageAnnotation({
      ...object.toJSON(),
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

  return annotation;

}

// function checkIsObjectAndHasKey (item: unknown, key: string): item is Record<string, unknown> {
//   return typeof item === 'object' && item !== null && key in item;
// }