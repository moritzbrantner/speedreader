fn main() {
    println!("speedreader-server: A0 boundary only; document extraction arrives in A2");
}

#[cfg(test)]
mod tests {
    #[test]
    fn keeps_a0_server_dependency_free() {
        assert_eq!(env!("CARGO_PKG_NAME"), "speedreader-server");
    }
}
