
import {
    quicktype,
    InputData,
    JSONSchemaInput,
    FetchingJSONSchemaStore
} from "quicktype-core";
import { swaggerSpec } from "../server/swagger.js";
import fs from "fs";
import path from "path";

async function generateDartModels() {
    console.log("Generating Dart models from Swagger spec...");

    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());
    const schemas = (swaggerSpec as any).components?.schemas;

    if (!schemas) {
        console.error("No schemas found in Swagger spec");
        process.exit(1);
    }

    // Add each schema definition from Swagger
    for (const [name, schema] of Object.entries(schemas)) {
        await schemaInput.addSource({
            name: name,
            schema: JSON.stringify(schema)
        });
    }

    const inputData = new InputData();
    inputData.addInput(schemaInput);

    const { lines } = await quicktype({
        inputData,
        lang: "dart",
        rendererOptions: {
            "null-safety": "true",
            "required-props": "true",
            "final-props": "true",
            "copy-with": "true"
        }
    });

    const outputDir = path.join(process.cwd(), "mobile_app_flutter/lib/models");
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "generated_models.dart");

    // Add a header to the generated file
    // Add a header to the generated file
    const header = `// \n// GENERATED CODE - DO NOT MODIFY BY HAND\n// \n// **************************************************************************\n// Quicktype Generated Models\n// **************************************************************************\n\n`;

    // Filter out unwanted imports
    const filteredLines = lines.filter(line =>
        !line.includes("import 'package:meta/meta.dart';")
    );

    fs.writeFileSync(outputPath, header + filteredLines.join("\n"));
    console.log(`✓ Generated Dart models at ${outputPath}`);
}

generateDartModels().catch(console.error);
