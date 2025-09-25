const
	textDecoder = new TextDecoder("utf-8"),
	textEncoder = new TextEncoder(); // Always UTF-8

const
	zigzagDecode = x => (x >> x?.constructor(1)) ^ (-(x & x?.constructor(1))),
	zigzagEncode = (x, bitSize) => (x << x?.constructor(1)) ^ (x >> x?.constructor(bitSize - 1)); // byteSize, x * 8

function constructorFromArrayType(arrayType) {
	if (!ArrayBuffer.isView(arrayType)) {
		throw new Error("Invalid array type");
	};

	return [BigInt64Array, BigUint64Array].includes(arrayType) ? BigInt : Number;
}

function decodeRobloxFloat(x) {
	const exponent = x >>> 24;
	if (exponent === 0) return 0;

	const float =
		Math.pow(2, exponent - 127) * (1 + ((x >>> 1) & 0x7fffff) / 0x7fffff);

	return x & 1 ? -float : float; // -1 : 1
};

function encodeRobloxFloat(x) {
	if (x === 0) return 0;

	const sign = x < 0 ? 1 : 0;
	x = Math.abs(x);

	let exponent = Math.floor(Math.log2(x));
	const
		mantissa = x / Math.pow(2, exponent) - 1,
		encodedMantissa = Math.round(mantissa * 0x7fffff);

	const floatBits = ((exponent + 127) << 24) | (encodedMantissa << 1) | sign;
	return floatBits >>> 0;
}

// alloc
export default class ByteEditor extends DataView {
	byteIndex = 0;

	constructor(buffer = new ArrayBuffer(0, { maxByteLength: 2 ** 31 - 1 }), ...args) {
		super(buffer, ...args);
		this.automaticResizing = buffer.resizable;
	};

	get bytesLeft() {
		return this.byteLength - this.byteIndex;
	};

	get absoluteIndex() {
		return this.byteOffset + this.byteIndex
	}

	#readInterleaved(length, arrayType) { // deinterleave, uninterleave, byteAmount?
		const constructor = constructorFromArrayType(arrayType);

		const
			byteSize = arrayType.BYTES_PER_ELEMENT,
			bitsPerByte = constructor(8);

		const
			startOffset = this.byteIndex,
			endOffset = length * byteSize;

		return arrayType.from({ length }, (_, i) => {
			let value = constructor(0);

			for (let byteIndex = 0; byteIndex < byteSize; byteIndex++) {
				const
					offset = startOffset + ((i + length * byteIndex) % endOffset),
					byte = super.getUint8(offset);

				// value = (value << byteSize) | constructor(byte);
				value <<= bitsPerByte;
				value |= constructor(byte);

				this.move(1); // Remove?
			};

			return value;
		});
	};

	#writeInterleaved(values, arrayType) {
		if (!ArrayBuffer.isView(arrayType)) {
			throw new Error("Invalid array type");
		};

		const constructor = constructorFromArrayType(arrayType);

		const
			byteSize = arrayType.BYTES_PER_ELEMENT,
			bitsPerByte = constructor(8),
			byteMask = constructor(0xFF); // byteMax

		const { length } = values;

		const
			startOffset = this.byteIndex,
			endOffset = length * byteSize;

		for (let i = 0; i < length; i++) {
			let value = values[i];

			for (let byteIndex = byteSize - 1; byteIndex >= 0; byteIndex--) {
				const
					offset = startOffset + ((i + length * byteIndex) % endOffset),
					byte = Number(value & byteMask);

				super.setUint8(offset, byte);
				value >>= bitsPerByte;

				this.move(1);
			};
		};
	};

	move(offset) {
		this.byteIndex += offset;
		return this;
	}

	goto(offset) {
		this.byteIndex = offset;
		return this;
	}

	readBytes(length) {
		return Uint8Array.from({ length }, () => this.readUint8());
	}

	writeBytes(bytes) { // ...bytes
		bytes.forEach(byte => this.writeUint8(byte));
	};

	readString(length) {
		const bytes = this.readBytes(length);
		return textDecoder.decode(bytes); // String.fromCharCode(...charCodes);
	};

	writeString(string) {
		const bytes = textEncoder.encode(string);
		this.writeBytes(bytes);
	};

	readBoolean() {
		return Boolean(this.readUint8()); // === 1
	};

	writeBoolean(boolean) {
		this.writeUint8(Number(boolean));
	};

	readReferents(length) {
		const Referents = this.readInterleavedInt32(length);

		for (let i = 1; i < length; i++) {
			Referents[i] += Referents[i - 1];
		};

		return Referents;
	};

	writeReferents(Referents) {
		let lastValue = 0;
		this.writeInterleavedInt32(Int32Array.from(Referents, value => {
			const difference = value - lastValue;
			lastValue = value;
			return difference;
		}));
	}

	readInterleavedInt8(length) {
		return Int8Array.from(this.readBytes(length), zigzagDecode);
	};

	writeInterleavedInt8(values) { // bytes?
		this.writeBytes(Uint8Array.from(values, zigzagDecode));
	};

	readInterleavedUint32(length) {
		return this.#readInterleaved(length, Uint32Array);
	};

	writeInterleavedUint32(values) {
		this.#writeInterleaved(values, Uint32Array);
	}

	readInterleavedUint64(length) {
		return this.#readInterleaved(length, BigUint64Array);
	}

	writeInterleavedUint64(values) {
		this.#writeInterleaved(values, BigUint64Array);
	}

	readInterleavedInt32(length) {
		return Int32Array.from(this.readInterleavedUint32(length), zigzagDecode);
	}

	writeInterleavedInt32(values) {
		this.writeInterleavedUint32(Uint32Array.from(values, x => zigzagEncode(x, 32) >>> 0));
	}

	readInterleavedInt64(length) {
		return BigInt64Array.from(this.readInterleavedUint64(length), zigzagDecode);
	}

	writeInterleavedInt64(values) {
		this.writeInterleavedUint64(BigUint64Array.from(values, x => zigzagEncode(x, 64)));
	}

	readInterleavedRobloxFloat32(length) {
		return Float32Array.from(this.readInterleavedUint32(length), decodeRobloxFloat);
	}

	writeInterleavedRobloxFloat32(values) {
		this.writeInterleavedUint32(Uint32Array.from(values, encodeRobloxFloat));
	};

	readVarInt32() { // readVarInt32
		let result = 0;

		for (let i = 0; i < 5; i++) { // <= 4
			const
				shift = i * 7,
				byte = this.readUint8();

			result |= (byte & 0x7F) << shift;
			if ((byte & 0x80) === 0) break;
		};

		return result;
		/*
		let byte = 0, shift = 0, result = 0;

		do {
			byte = this.readUint8();
			result |= ((byte & 127) << shift);
			shift += 7;
		} while (byte & 128); // !== 0

		return result;
		*/
	};
};

const arrayTypes = {
	Int8: Int8Array,
	Uint8: Uint8Array,
	Int16: Int16Array,
	Uint16: Uint16Array,
	Int32: Int32Array,
	Uint32: Uint32Array,
	Float32: Float32Array,
	Float64: Float64Array,
	BigInt64: BigInt64Array,
	BigUint64: BigUint64Array,
};

const
	ByteEditorPrototype = ByteEditor.prototype,
	DataViewPrototype = DataView.prototype;

for (const [dataName, { BYTES_PER_ELEMENT: byteSize }] of Object.entries(arrayTypes)) {
	const DataViewToNewByteEditorFunction = (dataViewPrefix, byteEditorPrefix) => {
		const DataViewFunction = DataViewPrototype[dataViewPrefix + dataName];

		if (typeof DataViewFunction === "function") {
			ByteEditorPrototype[byteEditorPrefix + dataName] = function (...args) {
				const { automaticResizing, absoluteIndex } = this;
				if (automaticResizing) {
					this.buffer.resize(absoluteIndex + byteSize);
				}; // else if

				const { byteOffset, byteIndex, byteLength } = this;
				if (byteIndex + byteSize > byteLength) {
					throw new RangeError(`Attempt to read beyond buffer length: offset ${byteOffset}, index ${byteIndex}, size ${byteSize}, length ${byteLength}`);
				};

				this.move(byteSize);
				return DataViewFunction.call(this, absoluteIndex, ...args);
			};
		};
	};

	DataViewToNewByteEditorFunction("get", "read");
	DataViewToNewByteEditorFunction("set", "write");
};

/*
getInterleavedUint32(length) {
	const result = new Uint32Array(length);
	const startOffset = this.byteIndex;
	const
		length2 = length * 2,
		length3 = length * 3,
		length4 = length * 4;

	for (let i = 0; i < length; i++) {
		const
			byte0 = super.getUint8(startOffset + i),
			byte1 = super.getUint8(startOffset + ((i + length) % length4)),
			byte2 = super.getUint8(startOffset + ((i + length2) % length4)),
			byte3 = super.getUint8(startOffset + ((i + length3) % length4));

		result[i] =
			(byte0 << 24) +
			(byte1 << 16) +
			(byte2 << 8) +
			byte3;
	}

	this.move(length4);
	return result;
}

readInterleavedUint64(length) {
	const result = new BigUint64Array(length);
	const startOffset = this.byteIndex;

	const
		length2 = length * 2,
		length3 = length * 3,
		length4 = length * 4,
		length5 = length * 5,
		length6 = length * 6,
		length7 = length * 7,
		length8 = length * 8;

	for (let i = 0; i < length; i++) {
		const
			byte0 = BigInt(super.getUint8(startOffset + i)),
			byte1 = BigInt(super.getUint8(startOffset + ((i + length) % length8))),
			byte2 = BigInt(super.getUint8(startOffset + ((i + length2) % length8))),
			byte3 = BigInt(super.getUint8(startOffset + ((i + length3) % length8))),
			byte4 = BigInt(super.getUint8(startOffset + ((i + length4) % length8))),
			byte5 = BigInt(super.getUint8(startOffset + ((i + length5) % length8))),
			byte6 = BigInt(super.getUint8(startOffset + ((i + length6) % length8))),
			byte7 = BigInt(super.getUint8(startOffset + ((i + length7) % length8)));

		result[i] =
			(byte0 << 56n) +
			(byte1 << 48n) +
			(byte2 << 40n) +
			(byte3 << 32n) +
			(byte4 << 24n) +
			(byte5 << 16n) +
			(byte6 << 8n) +
			byte7;
	}

	this.move(length8);
	return result;
}
*/
