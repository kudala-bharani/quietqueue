# Open components and attribution

QuietQueue's original application code is MIT-licensed. Its learned semantic grouping is powered by these upstream projects, not by a model trained for this submission.

- **all-MiniLM-L6-v2**, by the Sentence Transformers contributors: [model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), Apache License 2.0. A pretrained English sentence-embedding model, with 384-dimensional output. [License](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/blob/main/LICENSE).
- **Xenova/all-MiniLM-L6-v2**: [ONNX conversion](https://huggingface.co/Xenova/all-MiniLM-L6-v2), Apache License 2.0. QuietQueue requests the quantized q8 weights; weights are downloaded on demand, not included in this repository.
- **Transformers.js 3.8.1**, Hugging Face contributors: [source](https://github.com/huggingface/transformers.js), Apache License 2.0. [License](https://github.com/huggingface/transformers.js/blob/main/LICENSE). Browser inference runtime fetched on demand from jsDelivr. A pinned dev dependency enables the repeatable Node integration test.
- **ONNX Runtime**, Microsoft and contributors: [source](https://github.com/microsoft/onnxruntime), MIT License. Included as a dependency of Transformers.js. [License](https://github.com/microsoft/onnxruntime/blob/main/LICENSE).

The original pretrained model and conversion are used unmodified. No weights or third-party source are vendored into the application. Runtime and model downloads retain their upstream licenses. No sponsorship, affiliation, fine-tuning, or model authorship is claimed.
