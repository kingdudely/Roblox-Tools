import luau_compile from "./compiler/index.js";
import luau_deserialize from "./deserializer/index.js";
import VM from "./vm/index.js";

function randomString(stringLength, allowedCharacters) {
	const characterAmount = allowedCharacters.length;
	return Array.from(crypto.getRandomValues(new Uint32Array(Number(stringLength))), randomValue => allowedCharacters[randomValue % characterAmount]).join(""); // randomValue?.constructor(characterAmount)
};

async function callFunction(chunkname, func) {
	try {
		return await func()
	} catch (e) {
		throw `${chunkname} ${e?.message ?? e}`;
	}
}

export default async function loadstring(source, chunkname = `[string "${randomString(7, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")}"]`) {
	const { buffer } = luau_compile(source);
	const deserialized = luau_deserialize(buffer);

	if (typeof deserialized === "string") {
		throw `${chunkname}${deserialized}`;
	};

	const vm = new VM();
	const closure = vm.newclosure(deserialized.protoList, deserialized.mainProtoIndex);
	return callFunction(chunkname, closure);
}
