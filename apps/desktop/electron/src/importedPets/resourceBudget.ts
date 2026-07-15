import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export interface ImportResourceLimits {
  maxBytes: number;
  maxFiles: number;
  maxDepth: number;
}

export const defaultImportResourceLimits: ImportResourceLimits = {
  maxBytes: 500 * 1024 * 1024,
  maxFiles: 1000,
  maxDepth: 8
};

export class ImportResourceError extends Error {
  readonly reason: "resource-limit" | "unsafe-path";

  constructor(reason: "resource-limit" | "unsafe-path", message: string) {
    super(message);
    this.reason = reason;
  }
}

export async function assertImportFolderTreeSafe(
  sourceRoot: string,
  limits: ImportResourceLimits = defaultImportResourceLimits
) {
  let fileCount = 0;
  let totalBytes = 0;
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > limits.maxDepth) throw new ImportResourceError("resource-limit", `宠物包目录深度不能超过 ${limits.maxDepth} 层。`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const entryStat = await lstat(entryPath);
      if (entryStat.isSymbolicLink()) throw new ImportResourceError("unsafe-path", `宠物包不能包含符号链接：${entry.name}`);
      if (entryStat.isDirectory()) {
        await visit(entryPath, depth + 1);
      } else if (entryStat.isFile()) {
        fileCount += 1;
        totalBytes += entryStat.size;
        if (fileCount > limits.maxFiles || totalBytes > limits.maxBytes) throw new ImportResourceError("resource-limit", "宠物包超出文件数量或总大小限制。");
      } else {
        throw new ImportResourceError("unsafe-path", `宠物包只能包含普通文件和目录：${entry.name}`);
      }
    }
  }
  const rootStat = await lstat(sourceRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new ImportResourceError("unsafe-path", "导入来源必须是普通目录，不能是符号链接。");
  await visit(sourceRoot, 0);
  return { fileCount, totalBytes };
}

export async function copyImportFolderSnapshot(
  sourceRoot: string,
  destinationRoot: string,
  limits: ImportResourceLimits = defaultImportResourceLimits
) {
  const rootStat = await lstat(sourceRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new ImportResourceError("unsafe-path", "导入来源必须是普通目录，不能是符号链接。");
  }

  let fileCount = 0;
  let totalBytes = 0;
  const noFollowFlag = (constants as unknown as Record<string, number>).O_NOFOLLOW ?? 0;
  const sourceRealRoot = await realpath(sourceRoot);
  await mkdir(destinationRoot, { recursive: true });

  async function visit(sourceDirectory: string, destinationDirectory: string, depth: number): Promise<void> {
    if (depth > limits.maxDepth) {
      throw new ImportResourceError("resource-limit", `宠物包目录深度不能超过 ${limits.maxDepth} 层。`);
    }
    const directoryRealPath = await realpath(sourceDirectory);
    const relativeDirectory = path.relative(sourceRealRoot, directoryRealPath);
    if (path.isAbsolute(relativeDirectory) || relativeDirectory.startsWith("..")) {
      throw new ImportResourceError("unsafe-path", "复制期间目录越出导入根目录。");
    }
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      const entryStat = await lstat(sourcePath);
      if (entryStat.isSymbolicLink()) {
        throw new ImportResourceError("unsafe-path", `宠物包不能包含符号链接：${entry.name}`);
      }
      if (entryStat.isDirectory()) {
        await mkdir(destinationPath);
        await visit(sourcePath, destinationPath, depth + 1);
        continue;
      }
      if (!entryStat.isFile()) {
        throw new ImportResourceError("unsafe-path", `宠物包只能包含普通文件和目录：${entry.name}`);
      }
      fileCount += 1;
      totalBytes += entryStat.size;
      if (fileCount > limits.maxFiles || totalBytes > limits.maxBytes) {
        throw new ImportResourceError("resource-limit", "宠物包超出文件数量或总大小限制。");
      }
      const sourceHandle = await open(sourcePath, constants.O_RDONLY | noFollowFlag);
      const destinationHandle = await open(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try {
        const openedStat = await sourceHandle.stat();
        if (!openedStat.isFile() || openedStat.dev !== entryStat.dev || openedStat.ino !== entryStat.ino) {
          throw new ImportResourceError("unsafe-path", `复制期间文件发生替换：${entry.name}`);
        }
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let position = 0;
        while (true) {
          const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, position);
          if (bytesRead === 0) break;
          let written = 0;
          while (written < bytesRead) {
            const result = await destinationHandle.write(buffer, written, bytesRead - written, position + written);
            written += result.bytesWritten;
          }
          position += bytesRead;
          if (totalBytes - entryStat.size + position > limits.maxBytes) {
            throw new ImportResourceError("resource-limit", "宠物包超出总大小限制。");
          }
        }
        const [finalSourceStat, destinationStat] = await Promise.all([sourceHandle.stat(), destinationHandle.stat()]);
        if (
          finalSourceStat.size !== openedStat.size ||
          finalSourceStat.mtimeMs !== openedStat.mtimeMs ||
          destinationStat.size !== openedStat.size
        ) {
          throw new ImportResourceError("unsafe-path", `复制期间文件内容发生变化：${entry.name}`);
        }
      } finally {
        await Promise.all([sourceHandle.close(), destinationHandle.close()]);
      }
    }
    if (await realpath(sourceDirectory) !== directoryRealPath) {
      throw new ImportResourceError("unsafe-path", "复制期间目录发生替换。");
    }
  }

  await visit(sourceRoot, destinationRoot, 0);
  return assertImportFolderTreeSafe(destinationRoot, limits);
}
