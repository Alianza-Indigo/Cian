/**
 * Embeddings de la biblioteca.
 *
 * Se usa `gemini-embedding-001` con dimensión de salida configurada a 1536,
 * que es la que fija el PRD. El cambio de proveedor no obligó a desviarse.
 *
 * `taskType` importa más de lo que parece: indexar y consultar usan espacios
 * distintos del mismo modelo, y mezclarlos degrada la recuperación de forma
 * silenciosa. Por eso hay dos funciones y no una con bandera.
 */
import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID } from './types';
import { isModelConfigured } from '../ai/provider';

function embeddingModel() {
  return google.textEmbeddingModel(EMBEDDING_MODEL_ID);
}

export function areEmbeddingsAvailable(): boolean {
  return isModelConfigured();
}

/** Vectores para indexar. Devuelve `null` si el modelo no está configurado. */
export async function embedForIndexing(
  texts: string[],
): Promise<number[][] | null> {
  if (!areEmbeddingsAvailable() || texts.length === 0) return null;

  try {
    const { embeddings } = await embedMany({
      model: embeddingModel(),
      values: texts,
      providerOptions: {
        google: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          taskType: 'RETRIEVAL_DOCUMENT',
        },
      },
    });

    return embeddings;
  } catch (error) {
    console.error(
      '[biblioteca] no se pudieron generar embeddings —',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/** Vector de una consulta. `null` si no se pudo, para caer a búsqueda de texto. */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (!areEmbeddingsAvailable() || query.trim().length === 0) return null;

  try {
    const { embedding } = await embed({
      model: embeddingModel(),
      value: query,
      providerOptions: {
        google: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          taskType: 'RETRIEVAL_QUERY',
        },
      },
    });

    return embedding;
  } catch (error) {
    console.error(
      '[biblioteca] no se pudo generar el vector de la consulta —',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
